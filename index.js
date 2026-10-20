require('dotenv').config();
const { Client, GatewayIntentBits: G, REST, Routes, SlashCommandBuilder: S,
  PermissionFlagsBits: P, EmbedBuilder, ChannelType, Partials } = require('discord.js');
const Database = require('better-sqlite3');
const express = require('express');
const crypto = require('crypto');
const E = process.env;

const db = new Database('data.db');
db.exec(`CREATE TABLE IF NOT EXISTS sanctions(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id TEXT,username TEXT,mod_id TEXT,mod_name TEXT,type TEXT,reason TEXT,ts INTEGER);
CREATE TABLE IF NOT EXISTS mc_logs(id INTEGER PRIMARY KEY AUTOINCREMENT,ts INTEGER,type TEXT,line TEXT);
CREATE TABLE IF NOT EXISTS links(user_id TEXT PRIMARY KEY,mc_name TEXT);`);

const client = new Client({ intents: [G.Guilds, G.GuildMembers, G.GuildModeration, G.GuildMessages, G.MessageContent, G.GuildVoiceStates], partials: [Partials.Message, Partials.Channel] });
const guild = () => client.guilds.cache.get(E.GUILD_ID);

// ---------- Détection de doubles comptes ----------
const norm = s => s.toLowerCase().replace(/[^a-z0-9]/g, '').replace(/\d+$/, '');
function flagsFor(m, all, banned) {
  const f = [], u = m.user, days = (Date.now() - u.createdTimestamp) / 864e5;
  if (days < 7) f.push('Compte de moins de 7 jours');
  else if (days < 30) f.push('Compte de moins de 30 jours');
  const n = norm(u.username);
  if (n.length >= 3) {
    const twins = all.filter(o => o.id !== m.id && norm(o.user.username) === n);
    if (twins.length) f.push('Pseudo similaire à ' + twins.map(t => t.user.username).slice(0, 3).join(', '));
    if (banned.some(b => norm(b) === n)) f.push('Pseudo similaire à un membre banni');
  }
  const mc = db.prepare('SELECT user_id FROM links WHERE mc_name=(SELECT mc_name FROM links WHERE user_id=?) AND user_id!=?').all(m.id, m.id);
  if (mc.length) f.push('Même pseudo Minecraft que ' + mc.length + ' autre(s) compte(s)');
  return f;
}
const bannedNames = () => db.prepare("SELECT DISTINCT username FROM sanctions WHERE type='ban'").all().map(r => r.username);

function publicInfo(m, all, banned) {
  const u = m.user;
  return {
    id: u.id, tag: u.username, display: m.displayName, bot: u.bot,
    avatar: u.displayAvatarURL({ size: 64 }),
    created: u.createdTimestamp, joined: m.joinedTimestamp,
    roles: m.roles.cache.filter(r => r.name !== '@everyone').map(r => r.name),
    sanctions: db.prepare('SELECT COUNT(*) c FROM sanctions WHERE user_id=?').get(u.id).c,
    mc: (db.prepare('SELECT mc_name FROM links WHERE user_id=?').get(u.id) || {}).mc_name || null,
    flags: flagsFor(m, all, banned),
  };
}

// ---------- Sanctions ----------
async function sendLog(embed) {
  const id = cfg.get('log_mod_ch') || cfg.get('log_default_ch') || E.LOG_CHANNEL_ID;
  const ch = id && await client.channels.fetch(id).catch(() => null);
  if (ch) ch.send({ embeds: [embed] }).catch(() => {});
}
async function act(type, userId, mod, reason, extra = {}) {
  reason = reason || 'Aucune raison';
  (client.botActs ??= new Set()).add(type + userId); setTimeout(() => client.botActs.delete(type + userId), 15000);
  const g = guild(), user = await client.users.fetch(userId);
  const m = await g.members.fetch(userId).catch(() => null);
  const need = () => { if (!m) throw new Error('Membre introuvable sur le serveur'); };
  if (['kick', 'timeout', 'untimeout', 'ban'].includes(type) && m && !m.manageable && type !== 'ban')
    throw new Error('Je ne peux pas sanctionner ce membre (rôle trop haut)');
  if (type !== 'warn' && type !== 'unban' && m) {
    await user.send(`Tu as reçu une sanction (${type}) sur **${g.name}**. Raison : ${reason}`).catch(() => {});
  } else if (type === 'warn') {
    await user.send(`Tu as reçu un avertissement sur **${g.name}**. Raison : ${reason}`).catch(() => {});
  }
  if (type === 'ban') await g.members.ban(userId, { reason, deleteMessageSeconds: 0 });
  if (type === 'unban') await g.members.unban(userId, reason);
  if (type === 'kick') { need(); await m.kick(reason); }
  if (type === 'timeout') { need(); await m.timeout(extra.minutes * 60000, reason); }
  if (type === 'untimeout') { need(); await m.timeout(null, reason); }
  db.prepare('INSERT INTO sanctions(user_id,username,mod_id,mod_name,type,reason,ts) VALUES(?,?,?,?,?,?,?)')
    .run(userId, user.username, mod.id, mod.name, type, reason + (extra.minutes ? ` (${extra.minutes} min)` : ''), Date.now());
  sendLog(new EmbedBuilder().setTitle(type.toUpperCase()).setColor(0xc0392b)
    .addFields({ name: 'Membre', value: `${user.username} (${userId})` }, { name: 'Modérateur', value: mod.name },
      { name: 'Raison', value: reason }).setTimestamp());
}

// ---------- Commandes ----------
const mk = (n, d, p) => new S().setName(n).setDescription(d).setDefaultMemberPermissions(p);
const cmds = [];
for (const [t, d, p] of [['ban', 'Bannir un membre', P.BanMembers], ['kick', 'Expulser un membre', P.KickMembers],
  ['warn', 'Avertir un membre', P.ModerateMembers], ['timeout', 'Rendre muet temporairement', P.ModerateMembers],
  ['untimeout', 'Retirer le mute', P.ModerateMembers]]) {
  const b = mk(t, d, p).addUserOption(o => o.setName('membre').setDescription('Membre').setRequired(true));
  if (t === 'timeout') b.addIntegerOption(o => o.setName('minutes').setDescription('Durée en minutes').setRequired(true).setMinValue(1).setMaxValue(40320));
  b.addStringOption(o => o.setName('raison').setDescription('Raison'));
  cmds.push(b);
}
cmds.push(
  mk('unban', 'Débannir via ID', P.BanMembers).addStringOption(o => o.setName('id').setDescription('ID Discord').setRequired(true)).addStringOption(o => o.setName('raison').setDescription('Raison')),
  mk('warns', 'Historique des sanctions', P.ModerateMembers).addUserOption(o => o.setName('membre').setDescription('Membre').setRequired(true)),
  mk('clearwarns', 'Effacer les sanctions', P.Administrator).addUserOption(o => o.setName('membre').setDescription('Membre').setRequired(true)),
  mk('purge', 'Supprimer des messages', P.ManageMessages).addIntegerOption(o => o.setName('nombre').setDescription('1 à 100').setRequired(true).setMinValue(1).setMaxValue(100)),
  mk('slowmode', 'Mode lent (0 = off)', P.ManageChannels).addIntegerOption(o => o.setName('secondes').setDescription('0 à 21600').setRequired(true).setMinValue(0).setMaxValue(21600)),
  mk('lock', 'Verrouiller le salon', P.ManageChannels),
  mk('unlock', 'Déverrouiller le salon', P.ManageChannels),
  mk('userinfo', 'Infos publiques + doubles comptes', P.ModerateMembers).addUserOption(o => o.setName('membre').setDescription('Membre').setRequired(true)),
  mk('alts', 'Liste des comptes suspects', P.ModerateMembers),
  mk('link', 'Lier un membre à son pseudo Minecraft', P.ModerateMembers).addUserOption(o => o.setName('membre').setDescription('Membre').setRequired(true)).addStringOption(o => o.setName('pseudo').setDescription('Pseudo Minecraft').setRequired(true)),
);

const ts = t => `<t:${Math.floor(t / 1000)}:F> (<t:${Math.floor(t / 1000)}:R>)`;
client.on('interactionCreate', async i => {
  if (!i.isChatInputCommand()) return;
  const mod = { id: i.user.id, name: i.user.username }, n = i.commandName;
  const reason = i.options.getString('raison');
  try {
    if (['ban', 'kick', 'warn', 'untimeout', 'timeout'].includes(n)) {
      const t = i.options.getUser('membre');
      await act(n, t.id, mod, reason, { minutes: i.options.getInteger('minutes') });
      return i.reply({ content: `${n} appliqué à **${t.username}**.`, ephemeral: true });
    }
    if (n === 'unban') { await act('unban', i.options.getString('id'), mod, reason); return i.reply({ content: 'Membre débanni.', ephemeral: true }); }
    if (n === 'warns') {
      const t = i.options.getUser('membre');
      const rows = db.prepare('SELECT * FROM sanctions WHERE user_id=? ORDER BY ts DESC LIMIT 15').all(t.id);
      return i.reply({ ephemeral: true, content: rows.length ? rows.map(r => `#${r.id} **${r.type}** par ${r.mod_name} : ${r.reason} (${ts(r.ts)})`).join('\n') : 'Aucune sanction.' });
    }
    if (n === 'clearwarns') { db.prepare('DELETE FROM sanctions WHERE user_id=?').run(i.options.getUser('membre').id); return i.reply({ content: 'Sanctions effacées.', ephemeral: true }); }
    if (n === 'purge') { const d = await i.channel.bulkDelete(i.options.getInteger('nombre'), true); return i.reply({ content: `${d.size} messages supprimés.`, ephemeral: true }); }
    if (n === 'slowmode') { await i.channel.setRateLimitPerUser(i.options.getInteger('secondes')); return i.reply({ content: 'Mode lent mis à jour.', ephemeral: true }); }
    if (n === 'lock' || n === 'unlock') {
      await i.channel.permissionOverwrites.edit(i.guild.roles.everyone, { SendMessages: n === 'lock' ? false : null });
      return i.reply(n === 'lock' ? 'Salon verrouillé.' : 'Salon déverrouillé.');
    }
    if (n === 'link') {
      db.prepare('INSERT OR REPLACE INTO links VALUES(?,?)').run(i.options.getUser('membre').id, i.options.getString('pseudo'));
      return i.reply({ content: 'Compte lié.', ephemeral: true });
    }
    if (n === 'userinfo' || n === 'alts') {
      await i.deferReply({ ephemeral: true });
      const all = await i.guild.members.fetch(), ban = bannedNames();
      if (n === 'userinfo') {
        const m = all.get(i.options.getUser('membre').id); if (!m) return i.editReply('Membre introuvable.');
        const p = publicInfo(m, all, ban);
        return i.editReply({ embeds: [new EmbedBuilder().setTitle(p.tag).setThumbnail(p.avatar)
          .setDescription(`**Compte créé :** ${ts(p.created)}\n**Arrivé :** ${ts(p.joined)}\n**Rôles :** ${p.roles.join(', ') || 'aucun'}\n**Sanctions :** ${p.sanctions}\n**Minecraft :** ${p.mc || 'non lié'}\n**Alertes :** ${p.flags.join(' | ') || 'aucune'}`)] });
      }
      const sus = all.filter(m => !m.user.bot).map(m => publicInfo(m, all, ban)).filter(p => p.flags.length).slice(0, 15);
      return i.editReply(sus.length ? sus.map(p => `**${p.tag}** : ${p.flags.join(' | ')}`).join('\n') : 'Aucun compte suspect.');
    }
  } catch (e) { const r = { content: 'Erreur : ' + e.message, ephemeral: true }; i.deferred ? i.editReply(r.content) : i.reply(r); }
});

client.on('guildMemberAdd', async m => {
  const all = await m.guild.members.fetch(), f = flagsFor(m, all, bannedNames());
  if (f.length) sendLog(new EmbedBuilder().setTitle('Nouveau membre suspect').setColor(0xe67e22)
    .setDescription(`${m.user.username} (${m.id})\nCompte créé ${ts(m.user.createdTimestamp)}\n${f.join('\n')}`));
});

// ---------- Dashboard + API ----------
const app = express();
app.use(express.json({ limit: '1mb' }));
const auth = require('./auth')(app, client, E, guild);
app.get('/api/members', auth, async (q, s) => {
  const all = await guild().members.fetch(), ban = bannedNames(), t = (q.query.q || '').toLowerCase();
  let list = all.filter(m => !t || m.user.username.toLowerCase().includes(t) || m.id === t).map(m => publicInfo(m, all, ban));
  if (q.query.suspects) list = list.filter(p => p.flags.length);
  s.json(list.sort((a, b) => b.created - a.created).slice(0, 200));
});
app.get('/api/sanctions', auth, (q, s) => s.json(db.prepare('SELECT * FROM sanctions ORDER BY ts DESC LIMIT 200').all()));
app.get('/api/logs', auth, (q, s) => s.json(db.prepare('SELECT * FROM mc_logs WHERE (?1=\'\' OR type=?1) ORDER BY id DESC LIMIT 300').all(q.query.type || '')));
app.get('/api/stats', auth, (q, s) => s.json({
  members: guild().memberCount, sanctions: db.prepare('SELECT COUNT(*) c FROM sanctions').get().c,
  alerts24h: db.prepare("SELECT COUNT(*) c FROM mc_logs WHERE type='anticheat' AND ts>?").get(Date.now() - 864e5).c }));
app.post('/api/action', auth, async (q, s) => {
  try { const { type, userId, reason, minutes } = q.body;
    await act(type, userId, { id: q.user.id, name: q.user.name + ' (dashboard)' }, reason, { minutes: +minutes || 10 }); s.json({ ok: 1 });
  } catch (e) { s.status(400).json({ error: e.message }); }
});

// Réception des logs Minecraft (shipper.js ou plugin)
app.post('/api/mc/log', async (q, s) => {
  if (q.headers['x-api-key'] !== E.MC_API_KEY) return s.sendStatus(401);
  const lines = q.body.lines || [{ type: q.body.type, line: q.body.line }];
  const ins = db.prepare('INSERT INTO mc_logs(ts,type,line) VALUES(?,?,?)');
  for (const { type = 'log', line } of lines.slice(0, 200)) {
    if (!line) continue;
    ins.run(Date.now(), type, String(line).slice(0, 500));
    if (type === 'anticheat' && (cfg.get('mc_alert_ch') || E.MC_ALERT_CHANNEL_ID)) {
      const ch = await client.channels.fetch(cfg.get('mc_alert_ch') || E.MC_ALERT_CHANNEL_ID).catch(() => null);
      if (ch) ch.send({ embeds: [new EmbedBuilder().setTitle('Alerte anticheat').setColor(0xe74c3c).setDescription('```' + String(line).slice(0, 500) + '```').setTimestamp()] }).catch(() => {});
    }
  }
  db.prepare('DELETE FROM mc_logs WHERE id<(SELECT MAX(id)-50000 FROM mc_logs)').run();
  s.json({ ok: 1 });
});
const cfg = require('./settings')(db, app, auth, guild);
const ctx = { client, db, E, app, auth, cmds, sendLog, act, cfg, guild };
require('./protection')(ctx); require('./tickets')(ctx); require('./logs')(ctx);
app.get('/health', (q, s) => s.send('ok'));
app.use(express.static('public'));

// Le serveur web démarre tout de suite (Render exige un port ouvert), sans attendre la connexion du bot
app.listen(E.PORT || 3000, '0.0.0.0', () => console.log('Serveur web démarré sur le port ' + (E.PORT || 3000)));
client.once('ready', async () => {
  console.log('Bot connecté en tant que ' + client.user.tag);
  try {
    await new REST().setToken(E.DISCORD_TOKEN).put(Routes.applicationGuildCommands(E.CLIENT_ID, E.GUILD_ID), { body: cmds.map(c => c.toJSON()) });
    console.log('Commandes enregistrées');
  } catch (e) { console.error('Enregistrement des commandes impossible :', e.message); }
});
client.on('error', e => console.error('Erreur client :', e.message));
client.on('shardError', e => console.error('Erreur gateway :', e.message));
process.on('unhandledRejection', e => console.error('Erreur non gérée :', e));
setTimeout(() => { if (!client.isReady()) console.error('Le bot n’est toujours pas connecté après 60 s. Vérifie le token, les intents, ou un blocage de Discord sur l’IP de l’hébergeur.'); }, 60000);
client.login(E.DISCORD_TOKEN).catch(e => console.error('Connexion Discord impossible :', e.message));

// Sauvegarde automatique de la base dans un salon Discord privé (BACKUP_CHANNEL_ID)
async function backup() {
  if (!E.BACKUP_CHANNEL_ID) return;
  try {
    await db.backup('backup.db');
    const ch = await client.channels.fetch(E.BACKUP_CHANNEL_ID);
    await ch.send({ content: 'Sauvegarde du ' + new Date().toLocaleString('fr-FR'), files: [{ attachment: 'backup.db', name: 'data.db' }] });
    const mine = (await ch.messages.fetch({ limit: 50 })).filter(m => m.author.id === client.user.id).sort((a, b) => b.createdTimestamp - a.createdTimestamp);
    for (const m of [...mine.values()].slice(5)) await m.delete().catch(() => {});
  } catch (e) { console.error('Sauvegarde échouée :', e.message); }
}
client.once('ready', () => setInterval(backup, 30 * 60 * 1000));
process.on('SIGTERM', async () => { await backup(); process.exit(0); });
