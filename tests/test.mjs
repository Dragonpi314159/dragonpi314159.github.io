import assert from 'node:assert/strict';
import * as C from '../js/core.js';
import * as W from '../data/words.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok -', name); };
const seeded = (s) => () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);

t('scrabble points (BARRIER = 9)', () => assert.equal(C.wordPoints('barrier'), 9));
t('config roundtrip incl. unicode', () => {
  const cfg = C.mergeConfig({ lists: { bannedWords: ['café'] }, game: { roundSeconds: 90 } });
  const back = C.decodeConfig(C.encodeConfig(cfg));
  assert.equal(back.game.roundSeconds, 90); assert.deepEqual(back.lists.bannedWords, ['café']);
  assert.equal(back.commands.start.enabled, false);
});
t('bad config -> null', () => assert.equal(C.decodeConfig('%%%'), null));
t('defaults: 2 minute rounds, commands unchecked', () => {
  assert.equal(C.DEFAULTS.game.roundSeconds, 120);
  assert.ok(Object.values(C.DEFAULTS.commands).every((c) => !c.enabled));
});
t('no fake letters: every tile letter belongs to the base word', () => {
  const cfg = C.mergeConfig({}); const pools = C.buildPools(W, cfg);
  for (let lv = 1; lv <= 30; lv++) {
    const L = C.makeLevel(lv, cfg, pools, seeded(lv));
    assert.deepEqual([...L.letters].sort(), [...L.base].sort());
    assert.ok(L.answers.has(L.base)); assert.ok(L.goal <= L.total);
  }
});
t('difficulty ramps: later levels use higher-point bases', () => {
  const cfg = C.mergeConfig({}); const pools = C.buildPools(W, cfg);
  const avg = (lv) => { let s = 0; for (let i = 0; i < 40; i++) { const b = C.pickBase(lv, cfg, pools.bases, seeded(i + 1)); s += C.wordPoints(b) / b.length; } return s / 40; };
  assert.ok(avg(18) > avg(1), `${avg(1)} vs ${avg(18)}`);
});
t('letters grow with level', () => assert.ok(C.lettersForLevel(10, C.DEFAULTS.game) > C.lettersForLevel(1, C.DEFAULTS.game)));
t('banned word removed from pools', () => {
  const cfg = C.mergeConfig({ lists: { bannedWords: ['apple'] } }); const p = C.buildPools(W, cfg);
  assert.ok(!p.valid.has('apple') && !p.bases.includes('apple'));
});
t('custom words accepted', () => {
  const cfg = C.mergeConfig({ lists: { customWords: ['bastila'] } });
  assert.ok(C.buildPools(W, cfg).valid.has('bastila'));
});

function play(over = {}) {
  let T = 1000; const ev = [];
  const cfg = C.mergeConfig(over);
  const g = new C.Game(cfg, W, { rng: seeded(7), now: () => T, emit: (e, d) => ev.push([e, d]) });
  return { g, ev, cfg, at: (ms) => (T = ms) };
}
t('guess scoring, duplicates, first finder wins', () => {
  const { g } = play({ padlock: { enabled: false } }); g.start(1, 1000);
  const w = [...g.cur.answers.keys()][0];
  assert.ok(g.guess('Ann', w, 1500)); assert.equal(g.guess('bob', w, 1600), null);
  assert.equal(g.found.get(w).user, 'ann'); assert.equal(g.score, g.cur.answers.get(w));
});
t('padlock: one hit per section, unlocks next section', () => {
  const { g } = play({ padlock: { enabled: true, sectionSeconds: 10, guessesPerSection: 1 } }); g.start(1, 0);
  const [a, b, c] = [...g.cur.answers.keys()];
  assert.ok(g.guess('ann', a, 1000)); assert.equal(g.guess('ann', b, 2000), null);
  assert.ok(g.guess('bob', b, 2000)); assert.ok(g.guess('ann', c, 11000));
});
t('banned players silently ignored; ban/unban commands', () => {
  const { g } = play({ lists: { bannedPlayers: ['troll'] } }); g.start(1, 0);
  const w = [...g.cur.answers.keys()][0];
  assert.equal(g.guess('TROLL', w, 10), null); g.control('unban', 'troll'); assert.ok(g.guess('troll', w, 20));
  g.control('ban', '@troll'); assert.ok(g.bannedPlayers.has('troll'));
});
t('invalid guesses ignored', () => {
  const { g } = play(); g.start(1, 0);
  for (const x of ['zzzzzz', '', 'hello world', '!start', '123']) assert.equal(g.guess('a', x, 5), null);
});
t('timer ends round; fail retries same level; autopilot restarts', () => {
  const { g, ev } = play({ game: { resultSeconds: 5 } }); g.start(1, 0);
  g.tick(120000); assert.equal(g.phase, 'result'); assert.equal(g.lastResult.passed, false);
  assert.equal(g.nextLevel, 1); g.tick(125000); assert.equal(g.phase, 'playing');
  assert.ok(ev.some(([e]) => e === 'end'));
});
t('manual mode (autopilot off) waits for continue', () => {
  const { g } = play({ game: { autopilot: false } }); g.start(1, 0); g.tick(120000); g.tick(999999);
  assert.equal(g.phase, 'result'); g.control('continue', '', 1000000); assert.equal(g.phase, 'playing');
});
t('passing advances levels by stars', () => {
  const { g } = play({ padlock: { enabled: false } }); g.start(1, 0);
  for (const w of g.cur.answers.keys()) g.guess('p', w, 50);
  assert.equal(g.phase, 'result'); assert.equal(g.lastResult.stars, 5); assert.equal(g.nextLevel, 6);
});
t('star thresholds', () => {
  const g = C.DEFAULTS.game;
  assert.equal(C.starsFor(39, 40, 100, g), 0); assert.equal(C.starsFor(40, 40, 100, g), 1);
  assert.equal(C.starsFor(40 + 21, 40, 100, g), 2); assert.equal(C.starsFor(40 + 41, 40, 100, g), 3);
});
t('shuffle toggle + hidden letters reveal', () => {
  const on = play({ shuffle: { enabled: true, seconds: 2 }, hidden: { fromLevel: 1, revealPercent: 50 } });
  on.g.start(1, 0); assert.ok(on.g.cur.hidden.length >= 1); on.g.tick(2500);
  assert.ok(on.ev.some(([e]) => e === 'shuffle'));
  on.g.tick(61000); assert.ok(on.g.hiddenRevealed);
  const off = play({ shuffle: { enabled: false } }); off.g.start(1, 0); off.g.tick(50000);
  assert.ok(!off.ev.some(([e]) => e === 'shuffle'));
});
t('twitch parsing: mod/broadcaster badges', () => {
  const m = C.chatMessage('@badges=moderator/1;display-name=Mo :mo!mo@mo.tmi.twitch.tv PRIVMSG #chan :!start now');
  assert.deepEqual([m.login, m.isMod, m.isBroadcaster, m.text], ['mo', true, false, '!start now']);
  assert.equal(C.chatMessage('PING :tmi.twitch.tv'), null);
});
t('commands: disabled by default, custom names, permissions', () => {
  const mod = { isMod: true, isBroadcaster: false }, viewer = { isMod: false, isBroadcaster: false }, host = { isMod: false, isBroadcaster: true };
  assert.equal(C.matchCommand('!start', C.mergeConfig({}), host), null);
  const cfg = C.mergeConfig({ commands: { start: { enabled: true, name: 'go', perm: 'mod' }, ban: { enabled: true, name: 'ban', perm: 'streamer' } } });
  assert.equal(C.matchCommand('!start', cfg, mod), null);
  assert.deepEqual(C.matchCommand('!GO', cfg, mod), { cmd: 'start', arg: '' });
  assert.equal(C.matchCommand('!go', cfg, viewer), null);
  assert.equal(C.matchCommand('!ban x', cfg, mod), null);
  assert.deepEqual(C.matchCommand('!ban x', cfg, host), { cmd: 'ban', arg: 'x' });
});
console.log(`\n${n} tests passed`);
