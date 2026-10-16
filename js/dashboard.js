import { DEFAULTS, mergeConfig, encodeConfig, decodeConfig } from './core.js';

const $ = (id) => document.getElementById(id);
const KEY = 'bcw_cfg';
const load = () => { try { return decodeConfig(localStorage.getItem(KEY) || ''); } catch { return null; } };
let cfg = load() || mergeConfig({});

const getP = (o, p) => p.split('.').reduce((a, k) => a?.[k], o);
const setP = (o, p, v) => { const ks = p.split('.'); const last = ks.pop(); ks.reduce((a, k) => a[k], o)[last] = v; };

function save() {
  try { localStorage.setItem(KEY, encodeConfig(cfg)); } catch { /* storage blocked: link still works */ }
  renderLink();
}

// ---- generic binding for [data-path] controls
function bind(root = document) {
  root.querySelectorAll('[data-path]').forEach((el) => {
    if (el.dataset.bound) return; el.dataset.bound = '1';
    const p = el.dataset.path, v = getP(cfg, p);
    if (el.type === 'checkbox') el.checked = !!v; else el.value = v ?? '';
    el.addEventListener('input', () => {
      let nv = el.type === 'checkbox' ? el.checked : el.type === 'range' || el.type === 'number' ? Number(el.value) : el.value.trim();
      setP(cfg, p, nv);
      if (el.type === 'range' && el.nextElementSibling) el.nextElementSibling.value = el.value;
      save();
    });
  });
  root.querySelectorAll('.secret').forEach((el) => {
    if (el.dataset.sbound) return; el.dataset.sbound = '1';
    el.addEventListener('click', () => el.classList.add('revealed'));
    el.addEventListener('blur', () => el.classList.remove('revealed'));
  });
}

// ---- slider builders
function slider(parent, path, label, min, max, step, unit = '', help = '') {
  const d = document.createElement('div'); d.className = 'slider';
  const n = document.createElement('div'); n.className = 'name'; n.textContent = label;
  const r = document.createElement('input'); Object.assign(r, { type: 'range', min, max, step }); r.dataset.path = path;
  const o = document.createElement('output'); o.textContent = getP(cfg, path); o.dataset.unit = unit;
  r.addEventListener('input', () => { o.textContent = r.value + (unit ? ' ' + unit : ''); });
  d.append(n, r, o);
  if (help) { const h = document.createElement('div'); h.className = 'help'; h.textContent = help; d.append(h); }
  parent.append(d); o.textContent = getP(cfg, path) + (unit ? ' ' + unit : '');
}
function check(parent, path, label) {
  const l = document.createElement('label'); l.className = 'check';
  const i = document.createElement('input'); i.type = 'checkbox'; i.dataset.path = path;
  l.append(i, document.createTextNode(' ' + label)); parent.append(l);
}
function group(parent, title) { const g = document.createElement('div'); g.className = 'group'; if (title) { const h = document.createElement('b'); h.textContent = title; g.append(h); } parent.append(g); return g; }

function buildSliders() {
  const g = $('gameSliders');
  slider(g, 'game.roundSeconds', 'Round length', 20, 600, 5, 'sec', 'Default is 2 minutes (120), like the real game.');
  slider(g, 'game.startLetters', 'Letters on level 1', 4, 9, 1);
  slider(g, 'game.maxLetters', 'Most letters ever', 5, 10, 1);
  slider(g, 'game.levelsPerExtraLetter', 'Levels per extra letter', 1, 10, 1);
  slider(g, 'game.minWordLength', 'Shortest word allowed', 2, 5, 1, 'letters');
  slider(g, 'game.goalPercent', 'Points needed to pass', 10, 90, 1, '%', 'Share of all available points chat must score.');
  slider(g, 'game.rampLevels', 'Levels until hardest words', 3, 60, 1, 'levels', 'Higher levels pick scrambled words worth more Scrabble points (J, X, Q, Z, K, ...).');
  slider(g, 'game.starTwoPercent', '2 stars at', 10, 80, 1, '% beyond goal');
  slider(g, 'game.starThreePercent', '3 stars at', 20, 95, 1, '% beyond goal');
  slider(g, 'game.advance.one', 'Levels gained: 1 star', 1, 5, 1);
  slider(g, 'game.advance.two', 'Levels gained: 2 stars', 1, 8, 1);
  slider(g, 'game.advance.three', 'Levels gained: 3 stars', 1, 10, 1);
  slider(g, 'game.advance.perfect', 'Levels gained: perfect', 1, 15, 1);
  slider(g, 'game.resultSeconds', 'Result screen length', 3, 60, 1, 'sec');
  const o = group(g);
  check(o, 'game.autoStartOnLoad', 'Start playing as soon as the page loads');
  check(o, 'game.autopilot', 'Autopilot: continue by itself after each round');
  const row = document.createElement('div'); row.className = 'row';
  const lab = document.createElement('label'); lab.textContent = 'If time runs out before the goal';
  const sel = document.createElement('select'); sel.dataset.path = 'game.onFail';
  [['retry', 'Retry the same level'], ['reset', 'Back to level 1']].forEach(([v, t]) => sel.append(new Option(t, v)));
  row.append(lab, sel); o.append(row);

  const f = $('featureSliders');
  check(f, 'hidden.enabled', 'Hidden letters (shown as ?)');
  slider(f, 'hidden.fromLevel', 'Hidden letters start at level', 1, 30, 1);
  slider(f, 'hidden.maxHidden', 'Most hidden letters', 1, 4, 1);
  slider(f, 'hidden.revealPercent', 'Reveal them after', 10, 90, 5, '% of the round');
  const s = group(f, 'Letter shuffle');
  check(s, 'shuffle.enabled', 'Letters jump around while playing');
  slider(s, 'shuffle.seconds', 'Jump every', 1, 30, 1, 'sec', 'Smaller = faster.');
  const p = group(f, 'Padlocks');
  check(p, 'padlock.enabled', 'Padlocks: limit guesses per person');
  slider(p, 'padlock.sectionSeconds', 'Section length', 3, 60, 1, 'sec');
  slider(p, 'padlock.guessesPerSection', 'Hits per person per section', 1, 5, 1);

  const lk = $('lookSliders');
  check(lk, 'appearance.transparent', 'Transparent background (for OBS)');
  check(lk, 'appearance.showFeed', 'Show found words');
  slider(lk, 'appearance.tileSize', 'Tile size', 40, 140, 2, 'px');
  const r = document.createElement('div'); r.className = 'row';
  const l = document.createElement('label'); l.textContent = 'Accent color';
  const c = document.createElement('input'); c.type = 'color'; c.dataset.path = 'appearance.accent'; r.append(l, c); lk.append(r);
}

function buildCommands() {
  const t = $('cmdTable'); t.innerHTML = '';
  for (const [key, c] of Object.entries(cfg.commands)) {
    const row = document.createElement('div'); row.className = 'cmd' + (c.enabled ? ' on' : '');
    const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = c.enabled;
    const label = document.createElement('span'); label.textContent = c.label;
    const nm = document.createElement('span'); nm.className = 'nm';
    const bang = document.createElement('b'); bang.textContent = '!';
    const inp = document.createElement('input'); inp.placeholder = 'type command name here'; inp.value = c.name; inp.style.setProperty('--ph', '#888');
    nm.append(bang, inp);
    const perm = document.createElement('select'); [['mod', 'Mods'], ['streamer', 'Streamer only']].forEach(([v, x]) => perm.append(new Option(x, v))); perm.value = c.perm;
    cb.addEventListener('change', () => { c.enabled = cb.checked; row.classList.toggle('on', cb.checked); save(); });
    inp.addEventListener('input', () => { c.name = inp.value.trim().replace(/^!/, '').replace(/\s+/g, ''); save(); });
    perm.addEventListener('change', () => { c.perm = perm.value; save(); });
    row.append(cb, label, nm, perm); t.append(row);
  }
}

// ---- lists
function listUI(inId, btnId, listId, path, { blur, lower = true, pattern }) {
  const draw = () => {
    const box = $(listId); box.innerHTML = '';
    getP(cfg, path).forEach((w, i) => {
      const c = document.createElement('span'); c.className = 'chip' + (blur ? '' : ' plain');
      const t = document.createElement('span'); t.className = 't'; t.textContent = w;
      t.addEventListener('click', () => t.classList.toggle('revealed'));
      const x = document.createElement('button'); x.textContent = '×'; x.title = 'remove';
      x.addEventListener('click', () => { getP(cfg, path).splice(i, 1); save(); draw(); });
      c.append(t, x); box.append(c);
    });
  };
  const add = () => {
    const inp = $(inId); let v = inp.value.trim(); if (lower) v = v.toLowerCase(); v = v.replace(/^@/, '');
    if (!v || (pattern && !pattern.test(v))) { inp.style.borderColor = '#ff8f9d'; return; }
    inp.style.borderColor = '';
    const arr = getP(cfg, path); if (!arr.includes(v)) arr.push(v);
    inp.value = ''; save(); draw();
  };
  $(btnId).addEventListener('click', add);
  $(inId).addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
  draw(); return draw;
}

// ---- link output
function renderLink() {
  const out = mergeConfig(JSON.parse(JSON.stringify(cfg)));
  if (out.chat.mode !== 'twitch') { out.twitch.token = ''; }   // token only travels if posting is on
  out.twitch.clientId = '';                                      // overlay doesn't need it
  const base = new URL('index.html', location.href).href;
  const enc = encodeConfig(out);
  $('obsLink').value = `${base}#c=${enc}`;
  $('openPreview').href = `${base}#c=${enc}`;
  $('openDemo').href = `${base}#c=${enc}&demo=1`;
  const w = $('linkWarn');
  const msgs = [];
  if (out.chat.mode === 'twitch') msgs.push('This link contains your Twitch token (needed for posting). Treat it like a password and never show it on stream.');
  if ($('obsLink').value.length > 7000) msgs.push('The link is very long (large lists). OBS handles this, but some chat apps may cut it off.');
  w.hidden = !msgs.length; w.textContent = msgs.join(' ');
  $('redirectUrl').textContent = location.origin + location.pathname;
}

// ---- Twitch authorize (implicit flow, no server)
const SCOPES = 'chat:read chat:edit';
$('authBtn').addEventListener('click', () => {
  if (!cfg.twitch.clientId) { $('authStatus').textContent = 'Paste your Twitch Client ID first (README step 1).'; return; }
  const state = crypto.getRandomValues(new Uint32Array(4)).join('-');
  sessionStorage.setItem('bcw_state', state);
  const u = new URL('https://id.twitch.tv/oauth2/authorize');
  u.search = new URLSearchParams({ client_id: cfg.twitch.clientId, redirect_uri: location.origin + location.pathname,
    response_type: 'token', scope: SCOPES, state, force_verify: 'true' });
  location.href = u.href;
});

async function finishAuth() {
  const h = new URLSearchParams(location.hash.slice(1));
  if (!h.get('access_token')) return;
  history.replaceState(null, '', location.pathname + location.search);   // wipe token from the address bar
  if (h.get('state') !== sessionStorage.getItem('bcw_state')) { $('authStatus').textContent = 'Authorization failed (state mismatch). Try again.'; return; }
  sessionStorage.removeItem('bcw_state');
  const token = h.get('access_token');
  try {
    const r = await fetch('https://id.twitch.tv/oauth2/validate', { headers: { Authorization: `OAuth ${token}` } });
    if (!r.ok) throw new Error(r.status);
    const v = await r.json();
    Object.assign(cfg.twitch, { token, login: v.login, userId: v.user_id });
    if (!cfg.twitch.channel) cfg.twitch.channel = v.login;
    $('authStatus').textContent = `Connected as ${v.login}.`;
    save(); document.querySelectorAll('[data-path^="twitch."]').forEach((el) => { el.value = getP(cfg, el.dataset.path) ?? ''; });
  } catch { $('authStatus').textContent = 'Could not verify the token with Twitch. Try again.'; }
}

async function checkToken() {
  if (!cfg.twitch.token) return;
  try {
    const r = await fetch('https://id.twitch.tv/oauth2/validate', { headers: { Authorization: `OAuth ${cfg.twitch.token}` } });
    $('authStatus').textContent = r.ok ? `Connected as ${cfg.twitch.login}.` : 'Token expired - click Authorize again.';
  } catch { /* offline */ }
}

// ---- misc buttons
$('copyBtn').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('obsLink').value); $('copyBtn').textContent = 'Copied!'; }
  catch { $('obsLink').classList.add('revealed'); $('obsLink').select(); $('copyBtn').textContent = 'Press Ctrl+C'; }
  setTimeout(() => ($('copyBtn').textContent = 'Copy'), 1600);
});
$('loadBtn').addEventListener('click', () => {
  const m = $('loadIn').value.match(/[#&?]c=([A-Za-z0-9_-]+)/);
  const loaded = m && decodeConfig(m[1]);
  if (!loaded) { $('loadIn').style.borderColor = '#ff8f9d'; return; }
  cfg = loaded; save(); location.reload();
});
$('resetBtn').addEventListener('click', () => { if (confirm('Reset every setting, ban list and token?')) { localStorage.removeItem(KEY); location.reload(); } });

// ---- boot
buildSliders(); buildCommands();
bind();
listUI('banWordIn', 'banWordBtn', 'banWordList', 'lists.bannedWords', { blur: true, pattern: /^[a-z]{2,20}$/ });
listUI('banPlayerIn', 'banPlayerBtn', 'banPlayerList', 'lists.bannedPlayers', { blur: false, pattern: /^[a-z0-9_]{1,25}$/ });
listUI('customIn', 'customBtn', 'customList', 'lists.customWords', { blur: false, pattern: /^[a-z]{2,12}$/ });
renderLink(); finishAuth().then(checkToken);
