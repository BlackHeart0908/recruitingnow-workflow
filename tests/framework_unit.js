'use strict';
/* Framework v2 unit tests (Node, no browser). Deterministic.
   Proves the layout core is correct BY CONSTRUCTION: real LeadGenPro heights, random brain and line
   specs in both modes, mid-animation frames, and rejection of loops that need a design pass. */
const path = require('path');
const WF = require(path.join(__dirname, '..', 'public', 'framework', 'wf-framework-v2.js'));
const T = WF.TOKENS;
const failures = [];
function check(cond, msg) { if (!cond) failures.push(msg); }
function near(a, b, tol) { return Math.abs(a - b) <= (tol == null ? 1 : tol); }

let seed = 20260917;
function rnd() { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; }
function ri(a, b) { return a + Math.floor(rnd() * (b - a + 1)); }

/* ---- 1. version + tokens ---- */
check(WF.VERSION === '2.0.0', 'VERSION must be 2.0.0');
check(Object.isFrozen(T), 'TOKENS must be frozen');
check(T.CARD_W === 170 && T.HUB_W === 340 && T.GAP_CHAIN === 72 && T.GAP_BRANCH === 90 && T.GAP_LOOP === 45 && T.GAP_SECTOR === 120, 'tier values changed');
check(WF.dotCount(72) === 4 && WF.dotCount(10) === T.DOT_MIN && WF.dotCount(5000) === T.DOT_MAX, 'dotCount formula');

/* ---- 2. the real LeadGenPro spec with heights measured at 170px in the design session ---- */
const LGP_HEIGHTS = {"trunk":{"overview":119,"detail":159},"prospector":{"overview":182,"detail":430},"database":{"overview":199,"detail":429},"crm":{"overview":182,"detail":423},"whatsapp":{"overview":199,"detail":483},"coldcall":{"overview":182,"detail":405},"analyzer":{"overview":199,"detail":458},"coach":{"overview":182,"detail":430},"stubB":{"overview":118,"detail":118},"stubC":{"overview":118,"detail":118},"stubD":{"overview":87,"detail":87}};
const LGP_SPEC = { pattern: 'brain', hub: 'trunk',
  branches: [
    { id: 'A', dir: 'right', chain: ['prospector', 'database', 'crm'],
      forks: [{ at: 'crm', lanes: [{ side: -1, chain: ['whatsapp'] }, { side: 1, chain: ['coldcall', 'analyzer', 'coach'] }] }] },
    { id: 'B', dir: 'down', chain: ['stubB'] },
    { id: 'C', dir: 'left', chain: ['stubC'] },
    { id: 'D', dir: 'up', chain: ['stubD'] }],
  loops: [{ from: 'coach', to: 'crm' }] };
const cv = WF.canvasFor(LGP_SPEC, LGP_HEIGHTS);
['overview', 'detail'].forEach(function (m) {
  const L = WF.layout(LGP_SPEC, LGP_HEIGHTS, m, { shifts: cv.shifts });
  const c = L.cards;
  const v = WF.inspect(L, cv);
  check(v.length === 0, 'LGP ' + m + ' violations: ' + JSON.stringify(v));
  check(near(c.prospector.x - (c.trunk.x + c.trunk.w), T.GAP_BRANCH), 'LGP ' + m + ' hub to prospector must be GAP_BRANCH');
  check(near(c.database.x - (c.prospector.x + T.CARD_W), T.GAP_CHAIN), 'LGP ' + m + ' prospector to database must be GAP_CHAIN');
  check(near(c.crm.x - (c.database.x + T.CARD_W), T.GAP_CHAIN), 'LGP ' + m + ' database to crm must be GAP_CHAIN');
  check(near(c.whatsapp.x, c.coldcall.x) && near(c.whatsapp.x - (c.crm.x + T.CARD_W), T.GAP_BRANCH), 'LGP ' + m + ' lanes start one GAP_BRANCH right of CRM, same column');
  check(near(c.coldcall.y - (c.whatsapp.y + c.whatsapp.h), T.GAP_CHAIN), 'LGP ' + m + ' WhatsApp bottom to Cold Call top must be GAP_CHAIN');
  check(near(c.coldcall.y, c.analyzer.y) && near(c.analyzer.y, c.coach.y), 'LGP ' + m + ' lower lane top-aligned');
  check(near(c.analyzer.x - (c.coldcall.x + T.CARD_W), T.GAP_CHAIN) && near(c.coach.x - (c.analyzer.x + T.CARD_W), T.GAP_CHAIN), 'LGP ' + m + ' lower lane GAP_CHAIN');
  const byId = {}; L.pipes.forEach(function (p) { byId[p.id] = p; });
  check(near(byId.crm__whatsapp.len, byId.crm__coldcall.len, 2), 'LGP ' + m + ' the two fork pipes must be mirror images');
  check(byId.coach__crm && byId.coach__crm.kind === 'feedback' && byId.coach__crm.dots === 0, 'LGP ' + m + ' feedback loop present with no dots');
});
{ // WhatsApp grows upward: its bottom and port never move between modes
  const O = WF.layout(LGP_SPEC, LGP_HEIGHTS, 'overview', { shifts: cv.shifts }).cards.whatsapp;
  const D = WF.layout(LGP_SPEC, LGP_HEIGHTS, 'detail', { shifts: cv.shifts }).cards.whatsapp;
  check(near(O.y + O.h, D.y + D.h), 'upper lane card must keep its bottom fixed across modes');
}

/* ---- 3. random brain specs, both modes ---- */
function randomBrain(withLoops) {
  let n = 0; const H = {};
  const mk = function () { const id = 'c' + (n++); const o = ri(80, 260); H[id] = { overview: o, detail: o + ri(0, 300) }; return id; };
  H.hub = { overview: ri(90, 140) }; H.hub.detail = H.hub.overview + ri(0, 40);
  const dirs = ['right', 'down', 'left', 'up'].slice(0, ri(1, 4));
  const branches = dirs.map(function (d, i) {
    const chain = Array.from({ length: ri(1, 4) }, mk);
    const br = { id: 'B' + i, dir: d, chain: chain };
    if (rnd() < 0.75) {
      br.forks = [{ at: chain[ri(0, chain.length - 1)], lanes: Array.from({ length: ri(1, 4) }, function () { return { side: rnd() < 0.5 ? -1 : 1, chain: Array.from({ length: ri(1, 3) }, mk) }; }) }];
    }
    return br;
  });
  const loops = [];
  if (withLoops) branches.forEach(function (br) {
    if ((br.dir === 'right' || br.dir === 'left') && br.forks && rnd() < 0.8) {
      const lanes = br.forks[0].lanes, side = lanes[0].side;
      const same = lanes.filter(function (l) { return l.side === side; }), outer = same[same.length - 1];
      const k = br.chain.indexOf(br.forks[0].at);
      loops.push({ from: outer.chain[ri(0, outer.chain.length - 1)], to: br.chain[ri(0, k)] });
    }
  });
  return { spec: { pattern: 'brain', hub: 'hub', branches: branches, loops: loops }, H: H };
}
let brainRuns = 0, brainBad = 0, midRuns = 0, midBad = 0, rejected = 0, rejectTried = 0;
for (let t = 0; t < 1200; t++) {
  const r = randomBrain(true);
  let c;
  try { c = WF.canvasFor(r.spec, r.H); } catch (e) { failures.push('valid random brain spec threw: ' + e.message); continue; }
  ['overview', 'detail'].forEach(function (m) {
    brainRuns++;
    const v = WF.inspect(WF.layout(r.spec, r.H, m, { shifts: c.shifts }), c);
    if (v.length) { brainBad++; if (brainBad <= 3) failures.push('random brain ' + m + ': ' + JSON.stringify(v.slice(0, 2))); }
  });
  for (let k = 0; k < 2; k++) {                      // mid-animation frame with staggered per-card progress
    const mid = {};
    Object.keys(r.H).forEach(function (id) { const p = rnd(); const h = r.H[id].overview + p * (r.H[id].detail - r.H[id].overview); mid[id] = { overview: h, detail: h }; });
    midRuns++;
    const v = WF.inspect(WF.layout(r.spec, mid, 'overview', { shifts: c.shifts }), c);
    if (v.length) { midBad++; if (midBad <= 3) failures.push('mid-animation: ' + JSON.stringify(v.slice(0, 2))); }
  }
  const b0 = r.spec.branches[0];
  if (b0.forks && (b0.dir === 'right' || b0.dir === 'left')) {
    const lanes = b0.forks[0].lanes, s0 = lanes[0].side, same = lanes.filter(function (l) { return l.side === s0; });
    if (same.length > 1) {
      rejectTried++;
      try { WF.canvasFor(Object.assign({}, r.spec, { loops: [{ from: same[0].chain[0], to: b0.forks[0].at }] }), r.H); }
      catch (e) { if (/OUTERMOST/.test(e.message)) rejected++; }
    }
  }
}
check(brainBad === 0, 'random brain layouts with violations: ' + brainBad + ' of ' + brainRuns);
check(midBad === 0, 'mid-animation layouts with violations: ' + midBad + ' of ' + midRuns);
check(rejectTried > 50 && rejected === rejectTried, 'inner-lane loops must be rejected: ' + rejected + ' of ' + rejectTried);

/* ---- 4. random line specs (satellite above connected to each card, wide satellite below) ---- */
let lineRuns = 0, lineBad = 0;
for (let t = 0; t < 1000; t++) {
  let n = 0; const H = {};
  const mk = function () { const id = 'c' + (n++); const o = ri(80, 260); H[id] = { overview: o, detail: o + ri(0, 300) }; return id; };
  const chain = Array.from({ length: ri(2, 8) }, mk);
  H.orch = { overview: ri(90, 160) }; H.orch.detail = H.orch.overview + ri(0, 100);
  H.rev = { overview: ri(90, 160) }; H.rev.detail = H.rev.overview;
  const under = chain[ri(0, chain.length - 1)];
  const spec = { pattern: 'line', chain: chain, above: { id: 'orch', connect: 'each' }, below: [{ id: 'rev', under: under, width: 190 }], edges: [{ from: under, to: 'rev' }] };
  const c = WF.canvasFor(spec, H);
  ['overview', 'detail'].forEach(function (m) {
    lineRuns++;
    const L = WF.layout(spec, H, m);
    const v = WF.inspect(L, c);
    if (v.length) { lineBad++; if (lineBad <= 3) failures.push('random line ' + m + ': ' + JSON.stringify(v.slice(0, 2))); }
    const rev = L.cards.rev, u = L.cards[under];
    if (rev.y - (u.y + u.h) < T.GAP_CHAIN - 0.5) failures.push('line below-satellite must sit >= GAP_CHAIN under its card in ' + m);
  });
}
check(lineBad === 0, 'random line layouts with violations: ' + lineBad + ' of ' + lineRuns);

/* ---- 5. drag offsets: zero offsets reproduce the same pipes, a moved card moves its pipes ---- */
{
  const L = WF.layout(LGP_SPEC, LGP_HEIGHTS, 'overview', { shifts: cv.shifts });
  const same = WF.withOffsets(L, {});
  check(L.pipes.map(WF.pipePath).join('|') === same.pipes.map(WF.pipePath).join('|'), 'withOffsets({}) must reproduce identical pipes');
  const moved = WF.withOffsets(L, { database: { dx: 150, dy: 60 } });
  check(near(moved.cards.database.x, L.cards.database.x + 150) && near(moved.cards.database.y, L.cards.database.y + 60), 'withOffsets must move the card');
  const pBefore = L.pipes.filter(function (p) { return p.id === 'prospector__database'; })[0];
  const pAfter = moved.pipes.filter(function (p) { return p.id === 'prospector__database'; })[0];
  check(WF.pipePath(pBefore) !== WF.pipePath(pAfter), 'pipes attached to a dragged card must be rebuilt');
  check(near(L.cards.database.x, WF.layout(LGP_SPEC, LGP_HEIGHTS, 'overview', { shifts: cv.shifts }).cards.database.x), 'withOffsets must not mutate the base layout');
}

/* ---- 6. a deliberately broken layout must be caught by the inspector ---- */
{
  const L = WF.layout(LGP_SPEC, LGP_HEIGHTS, 'overview', { shifts: cv.shifts });
  L.cards.analyzer.x = L.cards.coldcall.x + 20;     // force an overlap
  const v = WF.inspect(L, cv);
  check(v.some(function (x) { return x.code === 'V1_CARD_GAP'; }), 'inspector must catch a forced overlap');
}

if (failures.length) {
  console.error('framework_unit.js: ' + failures.length + ' failure(s):');
  failures.forEach(function (f) { console.error('  - ' + f); });
  process.exit(1);
}
console.log('framework_unit.js: all checks passed (' + brainRuns + ' brain, ' + midRuns + ' mid-animation, ' + lineRuns + ' line layouts, ' + rejected + ' bad loops rejected).');
