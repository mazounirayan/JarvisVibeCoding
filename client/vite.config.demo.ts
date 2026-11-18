import { defineConfig, mergeConfig, type ViteUserConfig } from 'vite';
import baseConfig from './vite.config';

// Build statique de démonstration pour GitHub Pages :
// - servi sous le sous-chemin /JarvisVibeCoding/ ;
// - démarre directement en mode démo scénarisée, sans serveur ni modèle IA ;
// - aucune capacité de session réelle exposée (bouton de bascule masqué).
const demoConfig: ViteUserConfig = {
  base: '/JarvisVibeCoding/',
  define: { 'import.meta.env.VITE_STATIC_DEMO': '"1"' },
  build: { outDir: 'dist-demo' },
  preview: { port: 4174, strictPort: false },
};

export default mergeConfig(baseConfig as ViteUserConfig, demoConfig);
export { demoConfig };
