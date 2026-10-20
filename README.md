# Bot de modération + dashboard (connexion Discord)

## 1. Portail développeur Discord (https://discord.com/developers/applications)
- **Bot** : copie le token ; active **Server Members Intent** et **Message Content Intent**.
- **OAuth2** : copie le Client ID et le **Client Secret**, puis ajoute dans *Redirects* : `BASE_URL/callback`
  (ex : `https://bot.monsite.fr/callback`, ou `http://localhost:3000/callback` pour tester).
- Invite le bot (scopes `bot` + `applications.commands`, permission Administrateur). Son rôle doit être au-dessus des rôles qu'il modère.

## 2. Lancer (Node 18+)
    npm install
    cp .env.example .env     # remplis les valeurs
    npm start

## 3. Mettre le dashboard sur internet
Il faut un serveur qui tourne en permanence (VPS, hébergeur de bots, etc.) et un nom de domaine.
Exemple avec Caddy (HTTPS automatique) :
    caddy reverse-proxy --from bot.monsite.fr --to localhost:3000
Mets ensuite `BASE_URL=https://bot.monsite.fr` dans `.env`. Garde le bot allumé avec pm2 (`pm2 start index.js --name modbot`).

## Accès
Seuls les membres du serveur du bot ayant la permission **Administrateur** ou **Gérer le serveur** peuvent se connecter
(les droits sont revérifiés à chaque requête). Pour autoriser quelqu'un d'autre : `DASHBOARD_ADMIN_IDS=id1,id2`.

## Minecraft
Sur la machine Minecraft : `LOG_FILE=/chemin/logs/latest.log API_URL=https://bot.monsite.fr MC_API_KEY=ta_cle node shipper.js`

## Commandes
/ban /kick /warn /timeout /untimeout /unban /warns /clearwarns /purge /slowmode /lock /unlock /userinfo /alts /link
/ticketpanel /ticket add|remove|close /raidmode /lockdown
