export interface ToolDeclaration { name: string; description: string; parameters: Record<string, unknown> }
export interface ToolCall { name: string; args: unknown }
export interface AgentMessage { role: 'user' | 'assistant' | 'tool'; content?: string; calls?: ToolCall[]; raw?: unknown; toolName?: string; result?: unknown }
export interface ModelTurn { text: string; calls: ToolCall[]; raw?: unknown }
export interface ModelProvider { turn(system: string, messages: AgentMessage[], tools: ToolDeclaration[]): Promise<ModelTurn> }
export function createProvider(provider: 'local' | 'gemini', model: string, env: NodeJS.ProcessEnv): ModelProvider {
  if (!model) throw new Error('Choisissez un modèle dans les réglages.');
  return { async turn(system, messages, tools) {
    const local = provider === 'local';
    if (!local && !env.GEMINI_API_KEY) throw new Error('La clé Gemini doit être configurée côté serveur.');
    const base = env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';
    const url = local ? `${base.replace(/\/$/, '')}/api/chat` : `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model.replace(/^models\//, ''))}:generateContent`;
    const contents = messages.map(message => {
      if (message.role === 'tool') return { role: 'user', parts: [{ functionResponse: { name: message.toolName, response: { result: message.result } } }] };
      return { role: message.role === 'assistant' ? 'model' : 'user', parts: message.raw || [{ text: message.content || '' }] };
    });
    const ollamaMessages = [{ role: 'system', content: system }, ...messages.map(message => {
      if (message.role === 'tool') return { role: 'tool', tool_name: message.toolName, content: JSON.stringify(message.result) };
      return message.raw || { role: message.role, content: message.content || '' };
    })];
    const body = local ? { model, stream: false, messages: ollamaMessages, tools: tools.map(tool => ({ type: 'function', function: tool })), options: { num_predict: 1024 } } : {
      systemInstruction: { parts: [{ text: system }] }, contents,
      tools: [{ functionDeclarations: tools.map(tool => ({ name: tool.name, description: tool.description, parametersJsonSchema: tool.parameters })) }],
      generationConfig: { maxOutputTokens: 2048 }
    };
    let response: Response;
    try { response = await fetch(url, { method: 'POST', redirect: 'error', headers: { 'Content-Type': 'application/json', ...(!local ? { 'x-goog-api-key': env.GEMINI_API_KEY! } : {}) }, body: JSON.stringify(body), signal: AbortSignal.timeout(60000) }); }
    catch { throw new Error(local ? 'Ollama ne répond pas. Vérifiez son démarrage et le modèle installé.' : 'Gemini ne répond pas. Vérifiez la connexion et la configuration.'); }
    if (!response.ok) throw new Error(`Le modèle a refusé la demande (HTTP ${response.status}). Vérifiez la configuration et les quotas.`);
    if (!response.body) throw new Error('Réponse du modèle vide.');
    const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let bytes = 0;
    while (true) { const part = await reader.read(); if (part.done) break; bytes += part.value.byteLength; if (bytes > 1024 * 1024) { await reader.cancel(); throw new Error('Réponse du modèle trop volumineuse.'); } chunks.push(part.value); }
    const data = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, any>;
    if (local) {
      const message = data.message;
      if (!message || typeof message !== 'object') throw new Error('Réponse Ollama invalide.');
      const calls = (message.tool_calls || []).map((call: any) => ({ name: call.function?.name, args: call.function?.arguments }));
      return { text: typeof message.content === 'string' ? message.content : '', calls, raw: message };
    }
    const parts = data.candidates?.[0]?.content?.parts;
    if (!Array.isArray(parts)) throw new Error('Gemini n’a pas retourné de réponse exploitable.');
    return { text: parts.filter(part => !part.thought).map(part => part.text || '').join('').trim(), calls: parts.filter(part => part.functionCall).map(part => ({ name: part.functionCall.name, args: part.functionCall.args })), raw: parts };
  } };
}
