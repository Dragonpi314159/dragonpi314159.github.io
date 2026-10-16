import { Game, mergeConfig, decodeConfig, matchCommand, letterPoints, DEFAULTS } from './core.js';
import { TwitchChat, StreamerBot } from './twitch.js';
import * as WORDS from '../data/words.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.hash.slice(1));
let cfg = params.get('c') ? decodeConfig(params.get('c')) : null;
if (!cfg) { try { cfg = decodeConfig(localStorage.getItem('bcw_cfg') || '') ; } catch { /* ignore */ } }
cfg = cfg || mergeConfig({});
const demo = params.has('demo');

document.body.classList.toggle('transparent', cfg.appearance.transparent);
document.documentElement.style.setProperty('--accent', cfg.appearance.accent);
document.documentElement.style.setProperty('--tile', cfg.appearance.tileSize + 'px');
$('goalmark').style.left = cfg.game.goalPercent + '%';
$('found').style.display = cfg.appearance.showFeed ? '' : 'none';

const GAP = 10;
let tileEls = [];
const say = (() => {
  let chat = null, sb = null;
  return { setChat: (c) => (chat = c), setSb: (s) => (sb = s),
    post(text, flag) {
      if (!cfg.chat[flag]) return;
      if (cfg.chat.mode === 'twitch') chat?.say(text); else if (cfg.chat.mode === 'streamerbot') sb?.say(text);
    } };
})();

const fmt = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

function buildTiles(s) {
  const box = $('tiles'); box.innerHTML = ''; tileEls = [];
  const size = cfg.appearance.tileSize;
  box.style.width = s.letters.length * (size + GAP) - GAP + 'px';
  s.letters.forEach((ch, i) => {
    const el = document.createElement('div'); el.className = 'tile';
    el.dataset.ch = ch; box.appendChild(el); tileEls[i] = el;
  });
  paintTiles(s);
}
function paintTiles(s) {
  const size = cfg.appearance.tileSize;
  const hidden = new Set(s.hidden);
  s.letters.forEach((ch, i) => {
    const el = tileEls[i]; if (!el) return;
    const hid = hidden.has(i);
    el.classList.toggle('hid', hid);
    el.innerHTML = hid ? '?' : `${ch}<small>${letterPoints(ch)}</small>`;
    el.style.transform = `translateX(${s.order.indexOf(i) * (size + GAP)}px)`;
  });
}

const game = new Game(cfg, WORDS, { emit: (ev, d) => {
  if (ev === 'level') {
    $('overlay').hidden = true; $('found').innerHTML = '';
    $('level').textContent = `Level ${d.level}`; $('goalval').textContent = d.goal;
    buildTiles(d); updateScore();
    say.post(`Level ${d.level} started! Find words from the letters. Goal: ${d.goal} points.`, 'announceStart');
  } else if (ev === 'shuffle' || ev === 'reveal') paintTiles(d);
  else if (ev === 'found') {
    const c = document.createElement('div'); c.className = 'chip';
    c.innerHTML = `<b></b><i></i>`; c.firstChild.textContent = d.word; c.lastChild.textContent = `${d.user} +${d.points}`;
    $('found').prepend(c); while ($('found').children.length > 60) $('found').lastChild.remove();
    updateScore();
  } else if (ev === 'end') showResult(d);
  else if (ev === 'autopilot') updateAuto();
} });

function updateScore() {
  $('scoreval').textContent = game.score; $('goalval').textContent = game.cur?.goal ?? 0;
  $('barfill').style.width = game.cur ? Math.min(100, (game.score / game.cur.total) * 100) + '%' : '0';
  const gm = game.cur ? (game.cur.goal / game.cur.total) * 100 : cfg.game.goalPercent; $('goalmark').style.left = gm + '%';
}
function updateAuto() { $('auto').textContent = game.autopilot ? 'autopilot on' : ''; }

function showResult(r) {
  const o = $('overlay'); o.hidden = false;
  const stars = r.passed ? '★'.repeat(r.stars) : '✖';
  const top = r.top.map(([u, p]) => `${u} (${p})`).join(' · ') || 'nobody scored';
  const h = document.createElement('div');
  h.innerHTML = `<h2></h2><div class="stars"></div><div class="sub"></div><div class="sub"></div>`;
  h.querySelector('h2').textContent = r.passed ? 'Level cleared!' : 'Time\'s up!';
  h.querySelector('.stars').textContent = stars;
  h.querySelectorAll('.sub')[0].textContent = `${r.score} / ${r.goal} pts needed · ${r.found} of ${r.of} words`;
  h.querySelectorAll('.sub')[1].textContent = `Top: ${top}`;
  o.replaceChildren(h);
  say.post(r.passed ? `Level ${r.level} cleared with ${r.stars} star(s)! Next: level ${r.nextLevel}.` : `Time's up on level ${r.level}. ${r.score}/${r.goal} points.`,
    r.passed ? 'announceLevelUp' : 'announceEnd');
}

// -------- chat
function onChat(m) {
  const c = matchCommand(m.text, cfg, m);
  if (c) { game.control(c.cmd, c.arg); return; }
  game.guess(m.login, m.text);
}
const channel = cfg.twitch.channel || cfg.twitch.login;
const useToken = cfg.chat.mode === 'twitch';
const chat = new TwitchChat({ channel, login: useToken ? cfg.twitch.login : '', token: useToken ? cfg.twitch.token : '',
  onMessage: onChat, onStatus: (s) => { $('status').textContent = s; } });
say.setChat(chat);
if (cfg.chat.mode === 'streamerbot') { const sb = new StreamerBot(cfg.chat.streamerbotUrl, cfg.chat.streamerbotAction); sb.connect(); say.setSb(sb); }
if (channel && !demo) chat.connect(); else $('status').textContent = demo ? 'demo mode' : 'no channel set - open the dashboard';

// -------- loop
setInterval(() => {
  game.tick();
  if (game.phase === 'playing') $('timer').textContent = fmt(game.endMs - Date.now());
  else if (game.phase === 'idle') $('timer').textContent = fmt(cfg.game.roundSeconds * 1000);
}, 250);
updateAuto();
if (cfg.game.autoStartOnLoad || demo) game.start(1);

// -------- demo bots (preview without Twitch): ?demo in the hash
if (demo) setInterval(() => {
  if (game.phase !== 'playing') return;
  const left = [...game.cur.answers.keys()].filter((w) => !game.found.has(w));
  if (left.length) game.guess('viewer' + Math.floor(Math.random() * 40), left[Math.floor(Math.random() * left.length)]);
}, 1800);
window.__game = game; // handy for debugging in OBS "interact" / devtools
