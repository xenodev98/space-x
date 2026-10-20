// À lancer sur la machine du serveur Minecraft : node shipper.js
// Variables : LOG_FILE (ex: /srv/mc/logs/latest.log), API_URL (ex: http://IP_DU_BOT:3000), MC_API_KEY
const fs = require('fs');
const { LOG_FILE = './logs/latest.log', API_URL = 'http://localhost:3000', MC_API_KEY } = process.env;
// Adapte les mots-clés à ton anticheat (Grim, Vulcan, Matrix, Spartan, NoCheatPlus...)
const AC = /(grim|vulcan|matrix|spartan|nocheatplus|ncp|anticheat|flagged|failed|\bVL\b|violation)/i;
const TYPE = l => AC.test(l) ? 'anticheat' : /<[^>]+>/.test(l) ? 'chat' : /(joined the game|left the game)/.test(l) ? 'join' : /issued server command/.test(l) ? 'command' : 'log';
let pos = fs.existsSync(LOG_FILE) ? fs.statSync(LOG_FILE).size : 0, buf = [];
setInterval(() => {
  if (!fs.existsSync(LOG_FILE)) return;
  const size = fs.statSync(LOG_FILE).size; if (size < pos) pos = 0; if (size === pos) return;
  const fd = fs.openSync(LOG_FILE, 'r'), b = Buffer.alloc(size - pos); fs.readSync(fd, b, 0, b.length, pos); fs.closeSync(fd); pos = size;
  b.toString('utf8').split('\n').filter(Boolean).forEach(line => buf.push({ type: TYPE(line), line }));
}, 1000);
setInterval(async () => {
  if (!buf.length) return; const lines = buf.splice(0, 200);
  try { await fetch(API_URL + '/api/mc/log', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': MC_API_KEY }, body: JSON.stringify({ lines }) }); }
  catch (e) { buf.unshift(...lines); console.error('Envoi impossible :', e.message); }
}, 2000);
console.log('Envoi des logs de', LOG_FILE, 'vers', API_URL);
