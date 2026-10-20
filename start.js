// Point d'entrée : restaure la base depuis le salon de sauvegarde Discord si le disque est vide (hébergeurs gratuits), puis lance le bot.
require('dotenv').config();
const fs = require('fs');
(async () => {
  const { BACKUP_CHANNEL_ID: ch, DISCORD_TOKEN: tk } = process.env;
  if (ch && !fs.existsSync('data.db')) {
    try {
      const r = await fetch(`https://discord.com/api/v10/channels/${ch}/messages?limit=30`, { headers: { Authorization: 'Bot ' + tk } });
      if (!r.ok) console.error(`Restauration : Discord a répondu ${r.status} (${(await r.text()).slice(0, 60).replace(/\s+/g, ' ')}). On continue sans.`);
      else {
        const msgs = await r.json();
        const m = msgs.find(x => x.attachments?.some(a => a.filename === 'data.db'));
        if (m) {
          const a = m.attachments.find(a => a.filename === 'data.db');
          fs.writeFileSync('data.db', Buffer.from(await (await fetch(a.url)).arrayBuffer()));
          console.log('Base de données restaurée depuis Discord.');
        }
      }
    } catch (e) { console.error('Restauration impossible :', e.message); }
  }
  require('./index.js');
})();
