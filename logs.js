// Logs du serveur Discord (chaque catégorie s'active depuis le dashboard) + message de bienvenue
const { EmbedBuilder } = require('discord.js');
module.exports = ({ client, E, cfg }) => {
  const { get, num } = cfg;
  const ours = g => g && g.id === E.GUILD_ID;
  const ts = t => `<t:${Math.floor(t / 1000)}:R>`;
  const cut = s => (s || '*(inconnu)*').slice(0, 900);
  const mk = (title, color, desc) => new EmbedBuilder().setTitle(title).setColor(color).setDescription(String(desc).slice(0, 4000));
  async function out(cat, e) {
    if (!num('log_' + cat)) return;
    const id = get(`log_${cat}_ch`) || get('log_default_ch') || E.LOG_CHANNEL_ID; if (!id) return;
    const ch = await client.channels.fetch(id).catch(() => null);
    if (ch) ch.send({ embeds: [e.setTimestamp()] }).catch(() => {});
  }

  client.on('messageDelete', m => {
    if (!ours(m.guild) || m.author?.bot) return;
    out('messages', mk('Message supprimé', 0xe74c3c, `**Auteur :** ${m.author ? `${m.author} (${m.author.username})` : 'inconnu'}\n**Salon :** ${m.channel}\n**Contenu :** ${cut(m.content)}${m.attachments?.size ? `\n**Pièces jointes :** ${m.attachments.size}` : ''}`));
  });
  client.on('messageUpdate', (o, n) => {
    if (!ours(n.guild) || n.author?.bot || o.content == null || o.content === n.content) return;
    out('messages', mk('Message modifié', 0xe67e22, `**Auteur :** ${n.author || 'inconnu'}\n**Salon :** ${n.channel} ([voir](${n.url}))\n**Avant :** ${cut(o.content)}\n**Après :** ${cut(n.content)}`));
  });
  client.on('messageDeleteBulk', (ms, ch) => { if (ours(ch.guild)) out('messages', mk('Suppression en masse', 0xe74c3c, `${ms.size} messages supprimés dans ${ch}`)); });

  client.on('guildMemberAdd', m => {
    if (!ours(m.guild)) return;
    out('members', mk('Membre arrivé', 0x2ecc71, `${m} (${m.user.username})\nCompte créé ${ts(m.user.createdTimestamp)}\nMembres : ${m.guild.memberCount}`).setThumbnail(m.user.displayAvatarURL()));
    if (m.user.bot) return;
    if (num('welcome_on') && get('welcome_ch')) {
      const ch = m.guild.channels.cache.get(get('welcome_ch'));
      if (ch) ch.send(get('welcome_msg').replaceAll('{user}', `${m}`).replaceAll('{server}', m.guild.name).replaceAll('{count}', m.guild.memberCount)).catch(() => {});
    }
    if (get('welcome_role')) m.roles.add(get('welcome_role')).catch(() => {});
  });
  client.on('guildMemberRemove', m => {
    if (!ours(m.guild)) return;
    out('members', mk('Membre parti', 0x95a5a6, `${m.user.username} (${m.id})\nArrivé ${m.joinedTimestamp ? ts(m.joinedTimestamp) : 'à une date inconnue'}\nRôles : ${m.roles?.cache.filter(r => r.name !== '@everyone').map(r => r.name).join(', ') || 'aucun'}`));
  });
  client.on('guildMemberUpdate', (o, n) => {
    if (!ours(n.guild) || o.partial) return;
    if (o.nickname !== n.nickname) out('profile', mk('Pseudo modifié', 0x3498db, `${n} (${n.user.username})\n**Avant :** ${o.nickname || '*aucun*'}\n**Après :** ${n.nickname || '*aucun*'}`));
    const add = n.roles.cache.filter(r => !o.roles.cache.has(r.id)), rem = o.roles.cache.filter(r => !n.roles.cache.has(r.id));
    if (add.size || rem.size) out('roles', mk('Rôles modifiés', 0x9b59b6, `${n}\n${add.size ? '**Ajoutés :** ' + add.map(r => r.name).join(', ') + '\n' : ''}${rem.size ? '**Retirés :** ' + rem.map(r => r.name).join(', ') : ''}`));
    if (o.communicationDisabledUntilTimestamp !== n.communicationDisabledUntilTimestamp) {
      const on = n.communicationDisabledUntilTimestamp > Date.now();
      out('mod', mk(on ? 'Membre mute' : 'Mute retiré', 0xe67e22, `${n}${on ? `\nJusqu’à ${ts(n.communicationDisabledUntilTimestamp)}` : ''}`));
    }
  });
  client.on('guildBanAdd', b => { if (ours(b.guild) && !client.botActs?.has('ban' + b.user.id)) out('mod', mk('Membre banni', 0xc0392b, `${b.user.username} (${b.user.id})\nRaison : ${b.reason || 'aucune'}`)); });
  client.on('guildBanRemove', b => { if (ours(b.guild) && !client.botActs?.has('unban' + b.user.id)) out('mod', mk('Membre débanni', 0x2ecc71, `${b.user.username} (${b.user.id})`)); });
  client.on('roleCreate', r => ours(r.guild) && out('roles', mk('Rôle créé', 0x9b59b6, r.name)));
  client.on('roleDelete', r => ours(r.guild) && out('roles', mk('Rôle supprimé', 0x9b59b6, r.name)));
  client.on('channelCreate', c => ours(c.guild) && out('channels', mk('Salon créé', 0x1abc9c, `${c} (${c.name})`)));
  client.on('channelDelete', c => ours(c.guild) && out('channels', mk('Salon supprimé', 0x1abc9c, `#${c.name}`)));
  client.on('voiceStateUpdate', (o, n) => {
    if (!ours(n.guild) || o.channelId === n.channelId) return;
    const t = !o.channelId ? `a rejoint ${n.channel}` : !n.channelId ? `a quitté ${o.channel}` : `est passé de ${o.channel} à ${n.channel}`;
    out('voice', mk('Activité vocale', 0x34495e, `${n.member} ${t}`));
  });
};
