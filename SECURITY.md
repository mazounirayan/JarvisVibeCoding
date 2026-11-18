# Sécurité et données

Jarvis v2 est mono-utilisateur local. L'API écoute sur `127.0.0.1`, sans authentification des routes de conversation et d'historique. Une autre application du poste peut accéder au service. Ne pas exposer l'API via tunnel, proxy ou conteneur public sans ajouter authentification et autorisation.

## Actions et accès au PC

Le serveur valide les arguments des outils et exige une confirmation pour toute action ayant un effet. Il conserve la proposition exacte, lie la confirmation au jeton, impose une expiration et refuse le rejeu. Une phrase du modèle ne constitue jamais cette confirmation.

Les mutations du navigateur exigent l'origine configurée dans `CLIENT_ORIGIN`. Ce contrôle ne remplace pas l'authentification : un client non navigateur peut fournir Origin.

L'origine `http://127.0.0.1:5173` est également autorisée et les clients sans Origin sont admis. Host doit désigner une adresse loopback. Le webhook entrant est exempté du contrôle Origin, avec son Bearer obligatoire.

La recherche porte sur des noms de fichiers dans `JARVIS_ALLOWED_DIRS`, avec parcours borné, contrôle des chemins et exclusions sensibles. Elle ne lit pas les contenus. L'ouverture utilise les identifiants de `JARVIS_APPS`, exécutables absolus sans shell ni arguments libres du modèle. Un exécutable autorisé peut exécuter ses propres fonctions : choisir cette liste avec soin.

Aucune commande arbitraire, suppression de fichiers, paiement ou action sur les e-mails existants n'est disponible. Un résultat de fournisseur ou un nom de fichier est une donnée externe, pas une autorisation supplémentaire.

## Secrets et données

Conserver `GEMINI_API_KEY`, `N8N_WEBHOOK_URL` et `WEBHOOK_TOKEN` côté serveur, jamais dans `VITE_*`. Le jeton de notification protège uniquement `/api/webhook/notify`.

Le stockage JSON garde conversations, tâches, notes et paramètres sans chiffrement applicatif. Protéger `server/.data` ou son remplacement avec les droits du système. Exclure données, sauvegardes, captures privées et `.env` des archives.

Gitignore n'efface pas un secret committé. En cas d'exposition, révoquer et remplacer la clé, puis traiter copies et historique avec le détenteur du dépôt.

Gemini reçoit le contexte et les résultats d'outils transmis au modèle ; n8n reçoit les instructions. Une URL Ollama distante fait quitter les données au poste. La reconnaissance vocale du navigateur peut envoyer de l'audio à un service externe. Le mode Ollama ne garantit donc pas une chaîne vocale hors ligne. Le mode mains libres (« Jarvis », « Dis Jarvis ») maintient une écoute continue tant qu'il reste activé ; le désactiver coupe réellement le micro. La dictée remplit un brouillon : l'envoi part après environ 1,5 s de silence ou sur « Valider la phrase », et « Annuler » jette le brouillon sans rien envoyer.

## Avant hébergement et signalement

Ajouter authentification, autorisation par utilisateur, propriété des données, limites de débit, HTTPS et politique de rétention avant hébergement. Vérifier dépendances et secrets, protéger n8n et éviter les nouvelles tentatives aveugles après un délai dépassé.

Aucun canal privé de divulgation n'est configuré. Le mainteneur doit en fournir un avant publication. Ne pas publier une clé ou une vulnérabilité exploitable dans une issue publique ; utiliser un canal privé convenu.
