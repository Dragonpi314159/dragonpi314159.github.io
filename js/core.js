// Pure game logic. No DOM, no network: runs in the browser AND in Node (see tests/).

export const POINTS = {
  a: 1, e: 1, i: 1, o: 1, u: 1, l: 1, n: 1, s: 1, t: 1, r: 1,
  d: 2, g: 2, b: 3, c: 3, m: 3, p: 3, f: 4, h: 4, v: 4, w: 4, y: 4,
  k: 5, j: 8, x: 8, q: 10, z: 10,
};
export const letterPoints = (c) => POINTS[c] || 0;
export const wordPoints = (w) => [...w].reduce((s, c) => s + letterPoints(c), 0);

// ---------------------------------------------------------------- config
export const DEFAULT_COMMANDS = {
  start:     { enabled: false, name: 'start',     perm: 'mod', label: 'Start game' },
  restart:   { enabled: false, name: 'restart',   perm: 'mod', label: 'Restart level' },
  continue:  { enabled: false, name: 'continue',  perm: 'mod', label: 'Continue to next level' },
  autopilot: { enabled: false, name: 'autopilot', perm: 'mod', label: 'Autopilot on/off' },
  skip:      { enabled: false, name: 'skip',      perm: 'mod', label: 'Skip to next level' },
  endround:  { enabled: false, name: 'endround',  perm: 'mod', label: 'End round now' },
  ban:       { enabled: false, name: 'ban',       perm: 'mod', label: 'Ban a player (!ban name)' },
  unban:     { enabled: false, name: 'unban',     perm: 'mod', label: 'Unban a player (!unban name)' },
};

export const DEFAULTS = {
  v: 1,
  twitch: { clientId: '', channel: '', login: '', userId: '', token: '' },
  game: {
    roundSeconds: 120,        // normal game = 2 minutes
    startLetters: 6,
    maxLetters: 9,
    levelsPerExtraLetter: 3,  // +1 letter every N levels
    minWordLength: 3,
    goalPercent: 40,          // % of all available points needed to pass a level
    rampLevels: 20,           // levels until words are at max "point complexity"
    starTwoPercent: 34,       // of the points beyond the goal
    starThreePercent: 67,
    advance: { one: 1, two: 2, three: 3, perfect: 5 },
    onFail: 'retry',          // 'retry' same level | 'reset' back to level 1
    autoStartOnLoad: true,
    autopilot: true,
    resultSeconds: 10,
  },
  hidden: { enabled: true, fromLevel: 5, maxHidden: 3, revealPercent: 50 },
  shuffle: { enabled: true, seconds: 5 },  // letters jump around every N seconds
  padlock: { enabled: true, sectionSeconds: 15, guessesPerSection: 1 },
  commands: DEFAULT_COMMANDS,
  lists: { bannedWords: [], bannedPlayers: [], customWords: [], customAreBases: true },
  appearance: { transparent: true, accent: '#9b5cff', tileSize: 84, showFeed: true },
  chat: {
    mode: 'off',              // 'off' | 'twitch' (uses her token) | 'streamerbot'
    announceStart: false, announceEnd: false, announceLevelUp: false,
    streamerbotUrl: 'ws://127.0.0.1:8080/', streamerbotAction: 'BCW Chat Message',
  },
};

const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);
export function mergeConfig(partial, base = DEFAULTS) {
  const out = {};
  for (const k of Object.keys(base)) {
    const b = base[k], p = partial ? partial[k] : undefined;
    if (isObj(b)) out[k] = mergeConfig(isObj(p) ? p : {}, b);
    else if (Array.isArray(b)) out[k] = Array.isArray(p) ? p.slice() : b.slice();
    else out[k] = p === undefined || typeof p !== typeof b ? b : p;
  }
  return out;
}

export function encodeConfig(cfg) {
  const json = JSON.stringify(cfg);
  const bytes = new TextEncoder().encode(json);
  let bin = ''; bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function decodeConfig(str) {
  try {
    let s = str.replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    const bin = atob(s);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return mergeConfig(JSON.parse(new TextDecoder().decode(bytes)));
  } catch { return null; }
}

// ---------------------------------------------------------------- words
export function letterCounts(letters) {
  const c = {};
  for (const ch of letters) c[ch] = (c[ch] || 0) + 1;
  return c;
}
export function canForm(word, counts) {
  const c = { ...counts };
  for (const ch of word) { if (!c[ch]) return false; c[ch]--; }
  return true;
}
export function findAnswers(letters, validWords, minLen) {
  const counts = letterCounts(letters);
  const out = new Map();
  for (const w of validWords) {
    if (w.length >= minLen && w.length <= letters.length && canForm(w, counts)) out.set(w, wordPoints(w));
  }
  return out;
}

export function lettersForLevel(level, g) {
  const extra = Math.floor((level - 1) / Math.max(1, g.levelsPerExtraLetter));
  return Math.min(g.maxLetters, g.startLetters + extra);
}

export function shuffled(arr, rng = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// Pick a base word. Higher levels favour bases whose letters are worth more points
// (J, X, Q, Z, K, W, ... = more complex arrangements).
export function pickBase(level, cfg, bases, rng = Math.random) {
  const len = lettersForLevel(level, cfg.game);
  let pool = bases.filter((w) => w.length === len);
  if (!pool.length) pool = bases.filter((w) => Math.abs(w.length - len) <= 1);
  if (!pool.length) pool = bases.slice();
  pool.sort((a, b) => wordPoints(a) / a.length - wordPoints(b) / b.length);
  const p = Math.min(1, (level - 1) / Math.max(1, cfg.game.rampLevels));
  const center = Math.floor(p * (pool.length - 1));
  const win = Math.max(2, Math.floor(pool.length * 0.15));
  const lo = Math.max(0, center - win), hi = Math.min(pool.length - 1, center + win);
  return pool[lo + Math.floor(rng() * (hi - lo + 1))];
}

export function buildPools(words, cfg) {
  const banned = new Set(cfg.lists.bannedWords.map((w) => w.toLowerCase()));
  const custom = cfg.lists.customWords.map((w) => w.toLowerCase()).filter((w) => /^[a-z]{2,12}$/.test(w));
  const valid = new Set([...words.VALID, ...custom].filter((w) => !banned.has(w)));
  const bases = [...words.BASES, ...(cfg.lists.customAreBases ? custom.filter((w) => w.length >= 5 && w.length <= 9) : [])]
    .filter((w) => !banned.has(w));
  return { valid, bases: [...new Set(bases)] };
}

export function makeLevel(level, cfg, pools, rng = Math.random) {
  for (let tries = 0; tries < 30; tries++) {
    const base = pickBase(level, cfg, pools.bases, rng);
    let letters = shuffled([...base], rng);
    if (letters.join('') === base && letters.length > 1) letters = shuffled(letters, rng);
    const answers = findAnswers(letters, pools.valid, cfg.game.minWordLength);
    if (answers.size >= 6) {
      const total = [...answers.values()].reduce((a, b) => a + b, 0);
      const goal = Math.max(1, Math.ceil((total * cfg.game.goalPercent) / 100));
      let hidden = [];
      const h = cfg.hidden;
      if (h.enabled && level >= h.fromLevel) {
        const n = Math.min(h.maxHidden, 1 + Math.floor((level - h.fromLevel) / 3), letters.length - 3);
        hidden = shuffled(letters.map((_, i) => i), rng).slice(0, Math.max(0, n));
      }
      return { level, base, letters, hidden, answers, total, goal };
    }
  }
  throw new Error('Could not build a level - word list too small?');
}

export function starsFor(score, goal, total, g) {
  if (score < goal) return 0;
  if (score >= total) return 5;
  const rest = Math.max(1, total - goal);
  const ratio = ((score - goal) / rest) * 100;
  if (ratio >= g.starThreePercent) return 3;
  if (ratio >= g.starTwoPercent) return 2;
  return 1;
}
export function advanceFor(stars, g) {
  return { 1: g.advance.one, 2: g.advance.two, 3: g.advance.three, 5: g.advance.perfect }[stars] || 0;
}

// ---------------------------------------------------------------- game state machine
export class Game {
  constructor(cfg, words, { rng = Math.random, now = () => Date.now(), emit = () => {} } = {}) {
    this.cfg = cfg; this.rng = rng; this.now = now; this.emit = emit;
    this.words = words;
    this.pools = buildPools(words, cfg);
    this.phase = 'idle';
    this.level = 1; this.nextLevel = 1;
    this.autopilot = cfg.game.autopilot;
    this.bannedPlayers = new Set(cfg.lists.bannedPlayers.map((n) => n.toLowerCase()));
    this.lastResult = null;
  }

  start(level = this.nextLevel, at = this.now()) {
    const lv = makeLevel(level, this.cfg, this.pools, this.rng);
    this.cur = lv; this.level = level;
    this.order = lv.letters.map((_, i) => i);            // slot -> tile index
    this.found = new Map(); this.score = 0;
    this.locks = new Map(); this.contrib = new Map();
    this.startMs = at; this.endMs = at + this.cfg.game.roundSeconds * 1000;
    this.lastShuffle = at; this.hiddenRevealed = false;
    this.phase = 'playing';
    this.emit('level', this.snapshot());
  }

  snapshot() {
    const c = this.cur;
    return c && { level: c.level, letters: c.letters, hidden: this.hiddenRevealed ? [] : c.hidden, order: this.order,
      goal: c.goal, total: c.total, score: this.score, endMs: this.endMs, startMs: this.startMs, phase: this.phase };
  }

  sectionOf(at) {
    const s = this.cfg.padlock.sectionSeconds * 1000;
    return Math.floor((at - this.startMs) / Math.max(1, s));
  }
  isLocked(login, at) {
    const p = this.cfg.padlock;
    if (!p.enabled) return false;
    const l = this.locks.get(login);
    return !!l && l.section === this.sectionOf(at) && l.count >= p.guessesPerSection;
  }

  guess(login, text, at = this.now()) {
    if (this.phase !== 'playing') return null;
    login = String(login).toLowerCase();
    if (this.bannedPlayers.has(login)) return null;         // silently ignored
    const word = String(text).trim().toLowerCase();
    if (!/^[a-z]+$/.test(word)) return null;
    const pts = this.cur.answers.get(word);
    if (pts === undefined || this.found.has(word)) return null;
    if (this.isLocked(login, at)) return null;
    const sec = this.sectionOf(at);
    const l = this.locks.get(login);
    if (l && l.section === sec) l.count++; else this.locks.set(login, { section: sec, count: 1 });
    this.found.set(word, { user: login, points: pts, at });
    this.score += pts;
    this.contrib.set(login, (this.contrib.get(login) || 0) + pts);
    const ev = { word, user: login, points: pts, score: this.score };
    this.emit('found', ev);
    if (this.found.size >= this.cur.answers.size) this.finish(at);
    return ev;
  }

  tick(at = this.now()) {
    if (this.phase === 'playing') {
      const sh = this.cfg.shuffle;
      if (sh.enabled && at - this.lastShuffle >= sh.seconds * 1000) {
        this.lastShuffle = at;
        this.order = shuffled(this.order, this.rng);
        this.emit('shuffle', this.snapshot());
      }
      const total = this.endMs - this.startMs;
      if (!this.hiddenRevealed && this.cur.hidden.length && at - this.startMs >= (total * this.cfg.hidden.revealPercent) / 100) {
        this.hiddenRevealed = true; this.emit('reveal', this.snapshot());
      }
      if (at >= this.endMs) this.finish(at);
    } else if (this.phase === 'result' && this.autopilot && at >= this.resultUntil) {
      this.start(this.nextLevel, at);
    }
  }

  finish(at = this.now()) {
    if (this.phase !== 'playing') return;
    const g = this.cfg.game;
    const stars = starsFor(this.score, this.cur.goal, this.cur.total, g);
    const passed = stars > 0;
    this.nextLevel = passed ? this.level + advanceFor(stars, g) : g.onFail === 'reset' ? 1 : this.level;
    const top = [...this.contrib.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    const missed = [...this.cur.answers.keys()].filter((w) => !this.found.has(w));
    this.lastResult = { level: this.level, stars, passed, score: this.score, goal: this.cur.goal, total: this.cur.total,
      nextLevel: this.nextLevel, top, found: this.found.size, of: this.cur.answers.size, missed };
    this.phase = 'result';
    this.resultUntil = at + g.resultSeconds * 1000;
    this.hiddenRevealed = true;
    this.emit('end', this.lastResult);
  }

  // streamer / mod controls
  control(cmd, arg = '', at = this.now()) {
    switch (cmd) {
      case 'start': if (this.phase === 'idle') { this.start(1, at); } else if (this.phase === 'result') this.start(this.nextLevel, at); return true;
      case 'restart': this.start(this.phase === 'result' ? this.level : this.level || 1, at); return true;
      case 'continue': if (this.phase === 'result') this.start(this.nextLevel, at); return true;
      case 'autopilot': this.autopilot = arg ? !/^(off|false|0)$/i.test(arg) : !this.autopilot;
        this.emit('autopilot', this.autopilot); return true;
      case 'skip': this.start(this.level + 1, at); return true;
      case 'endround': this.finish(at); return true;
      case 'ban': if (arg) { this.bannedPlayers.add(arg.replace(/^@/, '').toLowerCase()); return true; } return false;
      case 'unban': if (arg) { this.bannedPlayers.delete(arg.replace(/^@/, '').toLowerCase()); return true; } return false;
      default: return false;
    }
  }
}

// ---------------------------------------------------------------- twitch chat parsing
export function parseIrc(line) {
  let rest = line.replace(/\r?\n$/, ''); const tags = {};
  if (rest.startsWith('@')) {
    const sp = rest.indexOf(' ');
    for (const kv of rest.slice(1, sp).split(';')) { const i = kv.indexOf('='); tags[i < 0 ? kv : kv.slice(0, i)] = i < 0 ? '' : kv.slice(i + 1); }
    rest = rest.slice(sp + 1);
  }
  let prefix = '';
  if (rest.startsWith(':')) { const sp = rest.indexOf(' '); prefix = rest.slice(1, sp); rest = rest.slice(sp + 1); }
  let trailing = null; const ti = rest.indexOf(' :');
  if (ti >= 0) { trailing = rest.slice(ti + 2); rest = rest.slice(0, ti); }
  const parts = rest.split(' ').filter(Boolean);
  return { tags, prefix, command: parts[0], params: parts.slice(1), trailing };
}

export function chatMessage(line) {
  const m = parseIrc(line);
  if (m.command !== 'PRIVMSG' || m.trailing == null) return null;
  const badges = (m.tags.badges || '').split(',').map((b) => b.split('/')[0]);
  const login = (m.prefix.split('!')[0] || '').toLowerCase();
  return { login, name: m.tags['display-name'] || login, text: m.trailing,
    isBroadcaster: badges.includes('broadcaster'), isMod: badges.includes('moderator') || m.tags.mod === '1' };
}

// returns {cmd, arg} if text is an enabled command this sender may use
export function matchCommand(text, cfg, who) {
  const t = text.trim();
  if (!t.startsWith('!')) return null;
  const [head, ...rest] = t.slice(1).split(/\s+/);
  for (const [cmd, c] of Object.entries(cfg.commands)) {
    if (!c.enabled || !c.name || c.name.toLowerCase().replace(/^!/, '') !== head.toLowerCase()) continue;
    const ok = c.perm === 'streamer' ? who.isBroadcaster : who.isBroadcaster || who.isMod;
    return ok ? { cmd, arg: rest.join(' ') } : null;
  }
  return null;
}
