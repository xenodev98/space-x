// Réglages du bot modifiables depuis le dashboard. Format : [section, clé, défaut, libellé, type, options]
// types : b = interrupteur, n = nombre, t = texte, c = salon, k = catégorie, r = rôle, s = liste
const LOGS = [['messages', 'Messages supprimés et modifiés'], ['members', 'Arrivées et départs de membres'], ['mod', 'Bans, débans et mutes'],
  ['roles', 'Rôles (création, suppression, attribution)'], ['channels', 'Salons (création, suppression)'], ['voice', 'Activité vocale'], ['profile', 'Changements de pseudo']];
const L = 'Logs du serveur';
const META = [
  [L, 'log_default_ch', '', 'Salon par défaut des logs', 'c'],
  ...LOGS.flatMap(([k, l]) => [[L, 'log_' + k, '0', l, 'b'], [L, 'log_' + k + '_ch', '', 'Salon dédié', 'c']]),
  ['Anti-spam', 'spam_on', '1', 'Anti-spam activé', 'b'],
  ['Anti-spam', 'spam_msgs', '5', 'Messages max dans la fenêtre', 'n'],
  ['Anti-spam', 'spam_secs', '5', 'Fenêtre de détection (secondes)', 'n'],
  ['Anti-spam', 'dup_max', '3', 'Messages identiques max', 'n'],
  ['Anti-spam', 'mention_max', '5', 'Mentions max par message', 'n'],
  ['Anti-spam', 'invites_block', '1', 'Bloquer les invitations Discord', 'b'],
  ['Anti-spam', 'caps_block', '1', 'Bloquer les majuscules abusives', 'b'],
  ['Anti-spam', 'strikes_to_mute', '3', 'Avertissements avant mute automatique', 'n'],
  ['Anti-spam', 'mute_minutes', '10', 'Durée du mute automatique (minutes)', 'n'],
  ['Anti-raid', 'raid_on', '1', 'Anti-raid activé', 'b'],
  ['Anti-raid', 'raid_joins', '6', 'Arrivées qui déclenchent le mode raid', 'n'],
  ['Anti-raid', 'raid_secs', '10', 'Sur combien de secondes', 'n'],
  ['Anti-raid', 'raid_action', 'kick', 'Action sur les arrivants pendant un raid', 's', [['kick', 'Expulser'], ['ban', 'Bannir'], ['none', 'Alerte seulement']]],
  ['Anti-raid', 'raid_minutes', '10', 'Durée du mode raid (minutes)', 'n'],
  ['Anti-raid', 'min_age_days', '0', 'Âge minimum du compte en jours (0 = désactivé)', 'n'],
  ['Tickets', 'ticket_category', '', 'Catégorie des tickets', 'k'],
  ['Tickets', 'ticket_staff_role', '', 'Rôle staff', 'r'],
  ['Tickets', 'ticket_log', '', 'Salon des transcriptions', 'c'],
  ['Bienvenue', 'welcome_on', '0', 'Message de bienvenue', 'b'],
  ['Bienvenue', 'welcome_ch', '', 'Salon de bienvenue', 'c'],
  ['Bienvenue', 'welcome_msg', 'Bienvenue {user} sur {server} ! Tu es le membre n°{count}.', 'Message ({user} {server} {count})', 't'],
  ['Bienvenue', 'welcome_role', '', 'Rôle donné automatiquement', 'r'],
  ['Minecraft', 'mc_alert_ch', '', 'Salon des alertes anticheat', 'c'],
];
module.exports = (db, app, auth, guild) => {
  db.exec('CREATE TABLE IF NOT EXISTS settings(k TEXT PRIMARY KEY,v TEXT)');
  const def = Object.fromEntries(META.map(m => [m[1], m]));
  const get = k => { const r = db.prepare('SELECT v FROM settings WHERE k=?').get(k); return r ? r.v : def[k][2]; };
  const num = k => Number(get(k)) || 0;
  app.get('/api/settings', auth, (q, s) => s.json(META.map(([section, key, , label, type, options]) => ({ section, key, label, type, options, value: get(key) }))));
  app.post('/api/settings', auth, (q, s) => {
    for (const [k, v] of Object.entries(q.body || {})) {
      const m = def[k]; if (!m) continue; const t = m[4], x = String(v).trim();
      const ok = t === 'b' ? /^[01]$/.test(x) : t === 'n' ? /^\d{1,6}$/.test(x) : ['c', 'k', 'r'].includes(t) ? /^\d{0,25}$/.test(x) : t === 's' ? m[5].some(o => o[0] === x) : x.length <= 300;
      if (!ok) return s.status(400).json({ error: 'Valeur invalide pour « ' + m[3] + ' »' });
      db.prepare('INSERT OR REPLACE INTO settings VALUES(?,?)').run(k, x);
    }
    s.json({ ok: 1 });
  });
  app.get('/api/guild', auth, async (q, s) => {
    const g = guild(); await g.channels.fetch();
    s.json({ name: g.name, icon: g.iconURL({ size: 64 }), members: g.memberCount,
      channels: g.channels.cache.filter(c => [0, 4, 5].includes(c.type)).map(c => ({ id: c.id, name: c.name, type: c.type })),
      roles: g.roles.cache.filter(r => r.name !== '@everyone' && !r.managed).map(r => ({ id: r.id, name: r.name })) });
  });
  return { get, num };
};
