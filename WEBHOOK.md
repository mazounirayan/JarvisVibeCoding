# Connecter n8n et les notifications

Les deux flux sont distincts : Jarvis déclenche le webhook configuré après confirmation ; un expéditeur peut enregistrer une notification dans son historique. Aucun de ces flux n'atteste automatiquement la fin d'un workflow.

## Déclenchement sortant

Configurer `N8N_WEBHOOK_URL` côté serveur et redémarrer. Un modèle configuré peut proposer l'outil trigger_workflow ; vérifier puis confirmer dans l'interface. Le serveur envoie POST JSON au seul destinataire autorisé :

```json
{ "source": "jarvis", "requested_at": "2026-10-11T12:00:00.000Z" }
```

La date est générée lors de l'envoi. Le nom prononcé dans la conversation ne sélectionne pas un autre workflow et l'instruction libre n'est pas transmise. L'outil n'accepte ni URL ni argument supplémentaire.

La réponse peut être vide ou textuelle : le serveur vérifie le statut HTTP, avec un délai de dix secondes et sans suivre les redirections. Un statut 2xx donne request_accepted, pas « workflow terminé ». Le jeton de confirmation est consommé même en cas d'échec. Consulter les exécutions n8n avant de demander une nouvelle action après un délai dépassé.

Aucun en-tête d'authentification personnalisé n'est joint à cet appel sortant. Protéger l'URL et le workflow, ne pas les committer ; adapter le destinataire à ce contrat.

## Notification entrante

Configurer un secret long et aléatoire `WEBHOOK_TOKEN`, puis redémarrer. L'expéditeur utilise :

```http
POST http://127.0.0.1:3001/api/webhook/notify
Authorization: Bearer votre_secret
Content-Type: application/json
```

```json
{ "event": "La préparation est terminée" }
```

event est une chaîne non vide de 1 à 200 caractères. Le serveur conserve le message avec « Notification reçue : » et retourne `{ "success": true }`. Ce texte vient de l'expéditeur : il n'est pas une vérification indépendante du workflow.

| Statut | Signification |
| --- | --- |
| 200 | Message enregistré. |
| 400 | Événement invalide. |
| 401 | Jeton absent ou incorrect. |
| 403 | Host non local. |
| 503 | Jeton non configuré ou stockage indisponible. |

Dans n8n, un nœud HTTP Request envoie cette notification, avec méthode POST, en-tête Authorization et corps JSON. Le webhook entrant est exempté du contrôle Origin mais exige son Bearer.

Jarvis écoute sur loopback : un n8n distant ne peut pas atteindre 127.0.0.1 sur cet ordinateur. Ne pas exposer l'API actuelle pour contourner cette limite ; voir [SECURITY.md](SECURITY.md). L'historique n'est pas diffusé en temps réel ; recharger l'interface pour consulter une notification externe.
