// Anti-spam, anti-raid, /raidmode, /lockdown
const { PermissionFlagsBits: P, SlashCommandBuilder: S, ChannelType, EmbedBuilder } = require('discord.js');
module.exports = ({ client, db, E, cmds, sendLog, act, cfg }) => {
  const { get, num } = cfg;
  const hist = new Map(), strikes = new Map(), recent = [];
  let raidUntil = 0, raidTimer;
  const AUTO = { id: 'auto', name: 'AutoMod' };
  const log = (id, name, type, reason) => db.prepare('INSERT INTO sanctions(user_id,username,mod_id,mod_name,type,reason,ts) VALUES(?,?,?,?,?,?,?)').run(id, name, 'auto', 'AutoMod', type, reason, Date.now());

  // ----- Anti-spam -----
  client.on('messageCreate', async m => {
    if (!m.guild || m.guild.id !== E.GUILD_ID || m.author.bot || !m.member || !num('spam_on')) return;
    if (m.member.permissions.has(P.ModerateMembers)) return; // le staff est exempté
    const now = Date.now(), c = m.content;
    const h = (hist.get(m.author.id) || []).filter(x => now - x.t < num('spam_secs') * 1000);
    h.push({ t: now, c, id: m.id, ch: m.channelId }); hist.set(m.author.id, h);
    const letters = c.replace(/[^a-zA-Z]/g, '').length;
    let why = null;
    if (h.length >= num('spam_msgs')) why = 'Flood de messages';
    else if (c && h.filter(x => x.c === c).length >= num('dup_max')) why = 'Messages répétés';
    else if (m.mentions.users.size + m.mentions.roles.size >= num('mention_max')) why = 'Mentions de masse';
    else if (num('invites_block') && /(discord\.gg|discord(app)?\.com\/invite)\/\w+/i.test(c)) why = "Lien d'invitation";
    else if (num('caps_block') && c.length >= 15 && letters && c.replace(/[^A-Z]/g, '').length / letters > 0.7) why = 'Abus de majuscules';
    if (!why) return;
    const ids = h.filter(x => x.ch === m.channelId).map(x => x.id);
    await m.channel.bulkDelete(ids, true).catch(() => m.delete().catch(() => {}));
    hist.delete(m.author.id);
    const s = (strikes.get(m.author.id) || []).filter(t => now - t < 6e5); s.push(now); strikes.set(m.author.id, s);
    if (s.length >= num('strikes_to_mute')) {
      strikes.delete(m.author.id);
      await act('timeout', m.author.id, AUTO, 'AutoMod : ' + why, { minutes: num('mute_minutes') || 10 }).catch(() => {});
    } else {
      log(m.author.id, m.author.username, 'automod', 'AutoMod : ' + why);
      const w = await m.channel.send(`${m.author}, ${why.toLowerCase()} (avertissement ${s.length}/${num('strikes_to_mute')}).`).catch(() => null);
      if (w) setTimeout(() => w.delete().catch(() => {}), 6000);
    }
  });

  // ----- Anti-raid -----
  async function punish(m, reason) {
    const a = get('raid_action'); if (a === 'none') return;
    try { a === 'ban' ? await m.ban({ reason }) : await m.kick(reason); log(m.id, m.user.username, a === 'ban' ? 'ban' : 'kick', reason); } catch {}
  }
  function startRaid() {
    const min = num('raid_minutes') || 10;
    raidUntil = Date.now() + min * 6e4; clearTimeout(raidTimer);
    raidTimer = setTimeout(() => { raidUntil = 0; sendLog(new EmbedBuilder().setTitle('Mode anti-raid désactivé').setColor(0x2ecc71)); }, min * 6e4);
    sendLog(new EmbedBuilder().setTitle('MODE ANTI-RAID ACTIVÉ').setColor(0xe74c3c)
      .setDescription(`Action sur les nouveaux arrivants : **${get('raid_action')}** pendant ${min} min. Utilise /raidmode off pour arrêter.`));
    recent.filter(x => Date.now() - x.t < num('raid_secs') * 2000).forEach(x => punish(x.m, 'Anti-raid'));
  }
  client.on('guildMemberAdd', m => {
    if (m.guild.id !== E.GUILD_ID || m.user.bot) return;
    const now = Date.now(); recent.push({ t: now, m });
    while (recent.length && now - recent[0].t > 6e4) recent.shift();
    const burst = recent.filter(x => now - x.t < num('raid_secs') * 1000).length;
    if (num('raid_on') && now >= raidUntil && burst >= num('raid_joins')) startRaid();
    if (now < raidUntil) return punish(m, 'Anti-raid');
    const min = num('min_age_days');
    if (min > 0 && (now - m.user.createdTimestamp) / 864e5 < min) {
      m.user.send(`Ton compte est trop récent pour rejoindre ${m.guild.name} (minimum ${min} jours).`).catch(() => {});
      m.kick('Compte trop récent').then(() => log(m.id, m.user.username, 'kick', `Compte de moins de ${min} jours`)).catch(() => {});
    }
  });

  cmds.push(
    new S().setName('raidmode').setDescription('Activer ou couper le mode anti-raid').setDefaultMemberPermissions(P.Administrator)
      .addStringOption(o => o.setName('etat').setDescription('on ou off').setRequired(true).addChoices({ name: 'on', value: 'on' }, { name: 'off', value: 'off' })),
    new S().setName('lockdown').setDescription('Verrouiller ou déverrouiller tous les salons').setDefaultMemberPermissions(P.Administrator)
      .addStringOption(o => o.setName('etat').setDescription('on ou off').setRequired(true).addChoices({ name: 'on', value: 'on' }, { name: 'off', value: 'off' })));
  client.on('interactionCreate', async i => {
    if (!i.isChatInputCommand()) return;
    const on = i.options.getString('etat') === 'on';
    if (i.commandName === 'raidmode') {
      if (on) startRaid(); else { raidUntil = 0; clearTimeout(raidTimer); }
      return i.reply({ content: `Mode anti-raid ${on ? 'activé' : 'désactivé'}.`, ephemeral: true });
    }
    if (i.commandName === 'lockdown') {
      await i.deferReply({ ephemeral: true }); let n = 0;
      for (const c of i.guild.channels.cache.values()) if (c.type === ChannelType.GuildText)
        await c.permissionOverwrites.edit(i.guild.roles.everyone, { SendMessages: on ? false : null }).then(() => n++).catch(() => {});
      i.editReply(`${n} salons ${on ? 'verrouillés' : 'déverrouillés'}.`);
    }
  });
};
