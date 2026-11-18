# Démarrer Jarvis v2

Prérequis : Node.js ≥20, npm et, pour la conversation IA, Ollama avec un modèle compatible avec les outils ou un compte Gemini configuré.

Depuis le dossier JarvisVibeCoding :

```powershell
npm ci
```

Les variables sont optionnelles au démarrage : renseigner `OLLAMA_MODEL` avec le nom exact d'un modèle déjà installé, ou `GEMINI_API_KEY` et `GEMINI_MODEL`, dans `server/.env` (créé par vos soins). Garder les clés côté serveur.

Dans deux terminaux depuis le même dossier :

```powershell
npm run dev:server
```

```powershell
npm run dev:client
```

Sur macOS/Linux, remplacer `Copy-Item` par `cp`. Ouvrir [http://localhost:5173](http://localhost:5173), puis choisir un fournisseur configuré dans les paramètres.

1. Demander de créer la tâche « Relire ma documentation ». Vérifier les arguments et confirmer.
2. Demander la liste, puis la clôture de cette tâche. Confirmer la clôture.
3. Créer une note après confirmation, puis demander les notes.
4. Redémarrer le serveur et vérifier que les données restent présentes.
5. Essayer le microphone si disponible : la dictée remplit un brouillon, l'envoi part après un silence d'environ 1,5 s ou sur « Valider la phrase », et « Annuler » jette le brouillon sans rien envoyer.

Sans fournisseur accessible, la conversation IA signale une erreur. Aucun fournisseur réel n'a été validé dans l'environnement de préparation. La reconnaissance vocale peut utiliser un service externe même avec Ollama local.

Sans modèle configuré, essayer `Créer tâche Relire ma documentation`, `Afficher les tâches`, `Note : Préparer la démo`, `Afficher les notes` et `État système`. Ces commandes locales restent utiles pour une démo sans compte ; créations et notes exigent confirmation. La clôture en langage naturel demande un modèle configuré.

Les permissions de recherche et d'applications sont vides par défaut. Configurer `JARVIS_ALLOWED_DIRS` et `JARVIS_APPS` dans `server/.env`, uniquement pour des chemins existants autorisés.

Après une erreur ou un délai dépassé, consulter les données ou n8n avant de réessayer. Une acceptation webhook ne prouve pas la fin d'un workflow.

```sh
npm run typecheck
npm test
npm run build
```

Voir [README.md](README.md) et [SECURITY.md](SECURITY.md) avant toute exposition de l'API.
