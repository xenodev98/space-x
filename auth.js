// Connexion avec Discord (OAuth2). Accès réservé aux admins du serveur du bot.
const crypto = require('crypto');
module.exports = (app, client, E, guild) => {
  const sessions = new Map();
  const base = (E.BASE_URL || E.RENDER_EXTERNAL_URL || `http://localhost:${E.PORT || 3000}`).replace(/\/$/, '');
  const secure = base.startsWith('https') ? '; Secure' : '';
  const cookies = r => Object.fromEntries((r.headers.cookie || '').split(';').filter(Boolean).map(c => { const i = c.indexOf('='); return [c.slice(0, i).trim(), c.slice(i + 1)]; }));
  const extra = (E.DASHBOARD_ADMIN_IDS || '').split(',').map(x => x.trim()).filter(Boolean);
  const allowed = m => m && (m.permissions.has('Administrator') || m.permissions.has('ManageGuild') || extra.includes(m.id));
  const page = (t, b) => `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><body style="font:16px system-ui;background:#0f1115;color:#e8ebf0;display:grid;place-items:center;height:100vh;margin:0"><div style="text-align:center;max-width:380px;padding:20px"><h2>${t}</h2><p style="color:#8a93a3">${b}</p><a href="/" style="color:#8c98ff">Retour</a></div>`;

  const auth = (q, s, n) => {
    const u = sessions.get(cookies(q).sid);
    if (!u || u.exp < Date.now()) return s.status(401).json({ error: 'Non connecté' });
    const m = guild()?.members.cache.get(u.id); // droits revérifiés à chaque requête
    if (m && !allowed(m)) { sessions.delete(cookies(q).sid); return s.status(403).json({ error: 'Accès retiré' }); }
    q.user = u; n();
  };

  app.get('/login', (q, s) => {
    const st = crypto.randomBytes(16).toString('hex');
    s.setHeader('Set-Cookie', `st=${st}; HttpOnly; SameSite=Lax; Path=/; Max-Age=600${secure}`);
    s.redirect('https://discord.com/oauth2/authorize?' + new URLSearchParams({ client_id: E.CLIENT_ID, redirect_uri: base + '/callback', response_type: 'code', scope: 'identify', state: st }));
  });
  app.get('/callback', async (q, s) => {
    const { code, state } = q.query;
    if (!code || !state || state !== cookies(q).st) return s.status(400).send(page('Connexion invalide', 'Réessaie de te connecter.'));
    try {
      const t = await (await fetch('https://discord.com/api/oauth2/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: E.CLIENT_ID, client_secret: E.CLIENT_SECRET, grant_type: 'authorization_code', code, redirect_uri: base + '/callback' }) })).json();
      if (!t.access_token) throw new Error('token');
      const u = await (await fetch('https://discord.com/api/users/@me', { headers: { Authorization: 'Bearer ' + t.access_token } })).json();
      const m = await guild().members.fetch(u.id).catch(() => null);
      if (!allowed(m)) return s.status(403).send(page('Accès refusé', 'Ce tableau de bord est réservé aux administrateurs du serveur où se trouve le bot.'));
      const sid = crypto.randomBytes(32).toString('hex');
      sessions.set(sid, { id: u.id, name: u.global_name || u.username, exp: Date.now() + 6048e5,
        avatar: u.avatar ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=64` : 'https://cdn.discordapp.com/embed/avatars/0.png' });
      s.setHeader('Set-Cookie', [`sid=${sid}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800${secure}`, 'st=; Max-Age=0; Path=/']);
      s.redirect('/');
    } catch { s.status(500).send(page('Erreur', 'Connexion à Discord impossible. Vérifie CLIENT_SECRET et l’URL de redirection.')); }
  });
  app.get('/api/me', auth, (q, s) => s.json({ id: q.user.id, name: q.user.name, avatar: q.user.avatar }));
  app.post('/logout', (q, s) => { sessions.delete(cookies(q).sid); s.setHeader('Set-Cookie', 'sid=; Max-Age=0; Path=/'); s.json({ ok: 1 }); });
  return auth;
};
