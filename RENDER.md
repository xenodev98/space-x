# Héberger gratuitement sur Render (sans carte, sans domaine)

Render donne une adresse HTTPS gratuite du type `https://ton-nom.onrender.com`, aucun domaine à acheter.

1. **Salon de sauvegarde** : crée un salon Discord privé (ex. #sauvegardes), donne au bot les droits Voir, Envoyer, Joindre des fichiers. Copie son ID.
2. **GitHub** : crée un dépôt privé et envoie-y tous les fichiers du projet (le `.gitignore` exclut déjà `.env`).
3. **Render** (render.com) : New > Web Service > choisis ton dépôt.
   - Runtime : Node ; Build : `npm install` ; Start : `node start.js` ; Instance : **Free**
   - Choisis un nom, par exemple `modbot-tonpseudo` : ton adresse sera `https://modbot-tonpseudo.onrender.com`
   - Environment : `DISCORD_TOKEN`, `CLIENT_ID`, `CLIENT_SECRET`, `GUILD_ID`, `MC_API_KEY`, `BACKUP_CHANNEL_ID`, `NODE_VERSION=20`
   (`BASE_URL` est détecté automatiquement.)
4. **Portail Discord** > OAuth2 > Redirects : ajoute `https://modbot-tonpseudo.onrender.com/callback`
5. **Garder le bot éveillé** : un service gratuit s'endort après 15 min sans visite. Crée un monitor gratuit sur uptimerobot.com
   (type HTTP, intervalle 5 min) vers `https://modbot-tonpseudo.onrender.com/health`.
6. Minecraft : lance `shipper.js` avec `API_URL=https://modbot-tonpseudo.onrender.com`.

La base de données est sauvegardée toutes les 30 min dans ton salon privé et restaurée automatiquement après un redémarrage.
Tu peux perdre au maximum 30 min de données (sanctions, réglages) si Render plante sans prévenir.
