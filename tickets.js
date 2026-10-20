// Système de tickets : panneau, ouverture, prise en charge, fermeture + transcription
const { ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ChannelType,
  PermissionFlagsBits: P, SlashCommandBuilder: S, AttachmentBuilder } = require('discord.js');
module.exports = ({ client, db, E, app, auth, cmds, cfg }) => {
  const { get } = cfg;
  db.exec('CREATE TABLE IF NOT EXISTS tickets(id INTEGER PRIMARY KEY AUTOINCREMENT,channel_id TEXT,user_id TEXT,username TEXT,type TEXT,status TEXT,claimed_by TEXT,created INTEGER,closed INTEGER)');
  const TYPES = { support: 'Support / question', report: 'Signaler un joueur', appeal: 'Demande de débannissement', other: 'Autre' };
  const isStaff = m => m.permissions.has(P.ManageMessages) || (get('ticket_staff_role') && m.roles.cache.has(get('ticket_staff_role')));
  const byChannel = id => db.prepare('SELECT * FROM tickets WHERE channel_id=?').get(id);
  const PERMS = [P.ViewChannel, P.SendMessages, P.AttachFiles, P.ReadMessageHistory];

  cmds.push(
    new S().setName('ticketpanel').setDescription('Poster le panneau de tickets').setDefaultMemberPermissions(P.Administrator),
    new S().setName('ticket').setDescription('Gérer un ticket').setDefaultMemberPermissions(P.ManageMessages)
      .addSubcommand(s => s.setName('add').setDescription('Ajouter un membre').addUserOption(o => o.setName('membre').setDescription('Membre').setRequired(true)))
      .addSubcommand(s => s.setName('remove').setDescription('Retirer un membre').addUserOption(o => o.setName('membre').setDescription('Membre').setRequired(true)))
      .addSubcommand(s => s.setName('close').setDescription('Fermer ce ticket')));

  async function open(i) {
    const type = i.values[0];
    const ex = db.prepare("SELECT channel_id FROM tickets WHERE user_id=? AND status='open'").get(i.user.id);
    if (ex && i.guild.channels.cache.has(ex.channel_id)) return i.reply({ content: `Tu as déjà un ticket ouvert : <#${ex.channel_id}>`, ephemeral: true });
    await i.deferReply({ ephemeral: true });
    const role = get('ticket_staff_role');
    const ow = [{ id: i.guild.id, deny: [P.ViewChannel] }, { id: i.user.id, allow: PERMS },
      { id: client.user.id, allow: [...PERMS, P.ManageChannels] }];
    if (role) ow.push({ id: role, allow: PERMS });
    const id = db.prepare("INSERT INTO tickets(user_id,username,type,status,created) VALUES(?,?,?,'open',?)").run(i.user.id, i.user.username, TYPES[type], Date.now()).lastInsertRowid;
    let ch;
    try {
      ch = await i.guild.channels.create({ name: `ticket-${id}-${i.user.username}`.slice(0, 90), type: ChannelType.GuildText,
        parent: get('ticket_category') || null, permissionOverwrites: ow, topic: `Ticket #${id} de ${i.user.username} (${i.user.id}) : ${TYPES[type]}` });
    } catch (e) { db.prepare('DELETE FROM tickets WHERE id=?').run(id); return i.editReply('Impossible de créer le ticket : ' + e.message); }
    db.prepare('UPDATE tickets SET channel_id=? WHERE id=?').run(ch.id, id);
    await ch.send({ content: `${i.user}${role ? ` <@&${role}>` : ''}`,
      embeds: [new EmbedBuilder().setColor(0x5fb878).setTitle(`Ticket #${id} : ${TYPES[type]}`)
        .setDescription(`Explique ta demande en détail, un membre du staff te répond rapidement.\nCompte créé <t:${Math.floor(i.user.createdTimestamp / 1000)}:R>`)],
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('tk_claim').setLabel('Prendre en charge').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('tk_close').setLabel('Fermer').setStyle(ButtonStyle.Danger))] });
    i.editReply(`Ton ticket est ouvert : ${ch}`);
  }

  async function close(ch, by) {
    const t = byChannel(ch.id); if (!t) return;
    db.prepare("UPDATE tickets SET status='closed',closed=? WHERE id=?").run(Date.now(), t.id);
    const msgs = []; let before;
    for (let k = 0; k < 5; k++) { const b = await ch.messages.fetch({ limit: 100, before }); if (!b.size) break; msgs.push(...b.values()); before = b.last().id; }
    const txt = msgs.reverse().map(x => `[${new Date(x.createdTimestamp).toLocaleString('fr-FR')}] ${x.author.username}: ${x.content}${x.attachments.size ? ' ' + x.attachments.map(a => a.url).join(' ') : ''}`).join('\n');
    const file = () => new AttachmentBuilder(Buffer.from(txt || '(vide)'), { name: `ticket-${t.id}.txt` });
    const lc = await client.channels.fetch(get('ticket_log') || E.LOG_CHANNEL_ID).catch(() => null);
    if (lc) lc.send({ content: `Ticket #${t.id} (${t.type}) de ${t.username} fermé par ${by.username}`, files: [file()] }).catch(() => {});
    const u = await client.users.fetch(t.user_id).catch(() => null);
    if (u) u.send({ content: `Ton ticket #${t.id} a été fermé. Voici la transcription.`, files: [file()] }).catch(() => {});
    setTimeout(() => ch.delete().catch(() => {}), 5000);
  }

  client.on('interactionCreate', async i => {
    try {
      if (i.isChatInputCommand() && i.commandName === 'ticketpanel') {
        await i.channel.send({
          embeds: [new EmbedBuilder().setColor(0x5fb878).setTitle('Besoin d\'aide ?').setDescription('Choisis le type de demande dans le menu pour ouvrir un ticket privé avec le staff.')],
          components: [new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('tk_open').setPlaceholder('Type de demande')
            .addOptions(Object.entries(TYPES).map(([value, label]) => ({ label, value }))))] });
        return i.reply({ content: 'Panneau posté.', ephemeral: true });
      }
      if (i.isStringSelectMenu() && i.customId === 'tk_open') return open(i);
      if (i.isButton() && (i.customId === 'tk_close' || i.customId === 'tk_claim')) {
        const t = byChannel(i.channelId); if (!t) return;
        if (i.customId === 'tk_claim') {
          if (!isStaff(i.member)) return i.reply({ content: 'Réservé au staff.', ephemeral: true });
          db.prepare('UPDATE tickets SET claimed_by=? WHERE id=?').run(i.user.username, t.id);
          return i.reply(`${i.user} prend ce ticket en charge.`);
        }
        if (!isStaff(i.member) && i.user.id !== t.user_id) return i.reply({ content: 'Tu ne peux pas fermer ce ticket.', ephemeral: true });
        await i.reply('Fermeture du ticket dans 5 secondes...'); return close(i.channel, i.user);
      }
      if (i.isChatInputCommand() && i.commandName === 'ticket') {
        const t = byChannel(i.channelId); if (!t) return i.reply({ content: 'Cette commande se utilise dans un ticket.', ephemeral: true });
        const sub = i.options.getSubcommand();
        if (sub === 'close') { await i.reply('Fermeture du ticket dans 5 secondes...'); return close(i.channel, i.user); }
        const u = i.options.getUser('membre');
        await i.channel.permissionOverwrites.edit(u.id, sub === 'add' ? Object.fromEntries(['ViewChannel', 'SendMessages', 'AttachFiles', 'ReadMessageHistory'].map(k => [k, true])) : { ViewChannel: false });
        return i.reply(sub === 'add' ? `${u} ajouté au ticket.` : `${u.username} retiré du ticket.`);
      }
    } catch (e) { const r = 'Erreur : ' + e.message; (i.replied || i.deferred) ? i.editReply(r).catch(() => {}) : i.reply({ content: r, ephemeral: true }).catch(() => {}); }
  });

  app.get('/api/tickets', auth, (q, s) => s.json(db.prepare('SELECT * FROM tickets ORDER BY id DESC LIMIT 200').all()));
};
