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
check(WF.VERSION === '2.2.0', 'VERSION must be 2.2.0');
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

/* ---- 2c. LeadGenPro with Branch C (two forks on one chain + pattern loop), heights from the Prompt C design session ---- */
const LGP_C_HEIGHTS = {"trunk":{"overview":119,"detail":159},"prospector":{"overview":182,"detail":430},"database":{"overview":199,"detail":429},"crm":{"overview":182,"detail":423},"whatsapp":{"overview":199,"detail":483},"coldcall":{"overview":182,"detail":405},"analyzer":{"overview":199,"detail":458},"coach":{"overview":182,"detail":430},"stubB":{"overview":118,"detail":118},"radarOrch":{"overview":199,"detail":520},"collector":{"overview":199,"detail":540},"judge":{"overview":199,"detail":560},"contact":{"overview":182,"detail":470},"radarDb":{"overview":199,"detail":520},"pattern":{"overview":199,"detail":500},"projWriter":{"overview":199,"detail":520},"projSend":{"overview":230,"detail":560},"recWriter":{"overview":199,"detail":500},"recSend":{"overview":230,"detail":540}};
const LGP_C_SPEC = { pattern: 'brain', hub: 'trunk',
  branches: [
    { id: 'A', dir: 'right', chain: ['prospector', 'database', 'crm'],
      forks: [{ at: 'crm', lanes: [{ side: -1, chain: ['whatsapp'] }, { side: 1, chain: ['coldcall', 'analyzer', 'coach'] }] }] },
    { id: 'B', dir: 'down', chain: ['stubB'] },
    { id: 'C', dir: 'left', chain: ['radarOrch', 'collector', 'judge', 'contact', 'radarDb'],
      forks: [
        { at: 'judge', lanes: [ { side: -1, chain: ['pattern'] } ] },
        { at: 'radarDb', lanes: [
          { side: -1, chain: ['projWriter', 'projSend'] },
          { side: 1, chain: ['recWriter', 'recSend'] }
        ] }
      ] }],
  loops: [
    { from: 'coach', to: 'crm' },
    { from: 'pattern', to: 'radarOrch' }
  ] };
{
  const cvC = WF.canvasFor(LGP_C_SPEC, LGP_C_HEIGHTS);
  ['overview', 'detail'].forEach(function (m) {
    const L = WF.layout(LGP_C_SPEC, LGP_C_HEIGHTS, m, { shifts: cvC.shifts });
    const c = L.cards;
    const v = WF.inspect(L, cvC);
    check(v.length === 0, 'LGP-C ' + m + ' violations: ' + JSON.stringify(v));
    check(near(c.pattern.x, c.contact.x), 'LGP-C ' + m + ' pattern must align with contact column');
    check(c.pattern.y + c.pattern.h < c.contact.y, 'LGP-C ' + m + ' pattern must sit above Contact Finder');
    check(near(c.projWriter.x, c.recWriter.x), 'LGP-C ' + m + ' both outreach lanes must share a column');
    const byId = {}; L.pipes.forEach(function (p) { byId[p.id] = p; });
    check(byId.pattern__radarOrch && byId.pattern__radarOrch.kind === 'feedback' && byId.pattern__radarOrch.dots === 0, 'LGP-C ' + m + ' pattern to orchestrator must be a zero-dot feedback pipe');
    check(byId.coach__crm && byId.coach__crm.kind === 'feedback', 'LGP-C ' + m + ' original coach feedback pipe must still exist');
    check(byId.judge__pattern && byId.judge__pattern.kind === 'sub', 'LGP-C ' + m + ' judge to pattern must be a sub pipe');
    check(byId.radarDb__projWriter && byId.radarDb__projWriter.kind === 'sub', 'LGP-C ' + m + ' radarDb to projWriter must be a sub pipe');
    check(byId.radarDb__recWriter && byId.radarDb__recWriter.kind === 'sub', 'LGP-C ' + m + ' radarDb to recWriter must be a sub pipe');
    check(byId.judge__contact && byId.judge__contact.kind === 'main', 'LGP-C ' + m + ' judge to contact must be a main-chain pipe');
  });
}

/* ---- 2d. LeadGenPro with Branch B (8-card vertical chain + two side lanes), heights from the Prompt B design session ---- */
{
  const LGP_B_HEIGHTS = Object.assign({}, LGP_C_HEIGHTS, {"trunk":{"overview":140,"detail":330},"piqBrief":{"overview":199,"detail":470},"piqDiscover":{"overview":199,"detail":500},"piqGate":{"overview":182,"detail":500},"piqExtract":{"overview":199,"detail":540},"piqApollo":{"overview":199,"detail":470},"piqDossier":{"overview":199,"detail":500},"piqWriter":{"overview":182,"detail":480},"piqSend":{"overview":230,"detail":540},"piqLinkedin":{"overview":199,"detail":470},"piqVault":{"overview":199,"detail":470}});
  delete LGP_B_HEIGHTS.stubB;
  const brA = LGP_C_SPEC.branches.find(function (b) { return b.id === 'A'; });
  const brC = LGP_C_SPEC.branches.find(function (b) { return b.id === 'C'; });
  const brB = { id: 'B', dir: 'down', chain: ['piqBrief', 'piqDiscover', 'piqGate', 'piqExtract', 'piqApollo', 'piqDossier', 'piqWriter', 'piqSend'],
    forks: [{ at: 'piqExtract', lanes: [{ side: -1, chain: ['piqLinkedin'] }, { side: 1, chain: ['piqVault'] }] }] };
  const LGP_B_SPEC = { pattern: 'brain', hub: 'trunk', branches: [brA, brC, brB], loops: LGP_C_SPEC.loops };
  const cvB = WF.canvasFor(LGP_B_SPEC, LGP_B_HEIGHTS);
  const cvRef = WF.canvasFor(LGP_C_SPEC, LGP_C_HEIGHTS);
  check(cvB.shifts.A.dx === 0 && cvB.shifts.A.dy === 0 && cvB.shifts.C.dx === 0 && cvB.shifts.C.dy === 0, 'LGP B: branches A and C must not be shifted');
  check(cvB.shifts.B.dx === 0 && cvB.shifts.B.dy === 0, 'LGP B: Branch B must not be pushed');
  ['overview', 'detail'].forEach(function (m) {
    const L = WF.layout(LGP_B_SPEC, LGP_B_HEIGHTS, m, { shifts: cvB.shifts });
    const c = L.cards;
    const v = WF.inspect(L, cvB);
    check(v.length === 0, 'LGP B ' + m + ' violations: ' + JSON.stringify(v));
    const R = WF.layout(LGP_C_SPEC, LGP_C_HEIGHTS, m, { shifts: cvRef.shifts }).cards;
    ['prospector', 'crm', 'whatsapp', 'coach', 'radarOrch', 'judge', 'pattern', 'radarDb', 'projSend', 'recSend'].forEach(function (id) {
      check(near(c[id].x, R[id].x) && near(c[id].y, R[id].y), 'LGP B ' + m + ' ' + id + ' moved from its Prompt C position');
    });
    brB.chain.forEach(function (id, i) {
      check(near(c[id].x, -T.CARD_W / 2), 'LGP B ' + m + ' ' + id + ' must sit in the centre column');
      if (i > 0) check(near(c[id].y - (c[brB.chain[i - 1]].y + c[brB.chain[i - 1]].h), T.GAP_CHAIN), 'LGP B ' + m + ' ' + id + ' chain gap must be GAP_CHAIN');
    });
    check(near(c.piqLinkedin.y, c.piqApollo.y) && near(c.piqVault.y, c.piqApollo.y), 'LGP B ' + m + ' side cards level with Apollo Enrichment');
    check(c.piqLinkedin.x + T.CARD_W < c.piqApollo.x && c.piqVault.x > c.piqApollo.x + T.CARD_W, 'LGP B ' + m + ' LinkedIn Finder left, Vault right');
    check(near(c.piqBrief.y - (c.trunk.y + c.trunk.h), T.GAP_BRANCH), 'LGP B ' + m + ' hub to Search Brief must be exactly GAP_BRANCH');
    const byId = {}; L.pipes.forEach(function (p) { byId[p.id] = p; });
    check(byId.trunk__piqBrief && byId.trunk__piqBrief.kind === 'trunk-branch', 'LGP B ' + m + ' hub pipe to Search Brief');
    check(byId.piqExtract__piqApollo && byId.piqExtract__piqApollo.kind === 'main', 'LGP B ' + m + ' extract to apollo is main');
    check(byId.piqExtract__piqLinkedin && byId.piqExtract__piqLinkedin.kind === 'sub' && byId.piqExtract__piqVault && byId.piqExtract__piqVault.kind === 'sub', 'LGP B ' + m + ' side pipes are sub');
    check(near(byId.piqExtract__piqLinkedin.len, byId.piqExtract__piqVault.len, 2), 'LGP B ' + m + ' side fork pipes must be mirror images');
    check(byId.pattern__radarOrch.kind === 'feedback' && byId.pattern__radarOrch.dots === 0 && byId.coach__crm.kind === 'feedback', 'LGP B ' + m + ' loops unchanged');
  });
}

/* ---- 2e. branch clearance is measured on real cards and pipes (framework 2.1.0) ---- */
{
  const H2 = Object.assign({}, LGP_C_HEIGHTS, {"trunk":{"overview":140,"detail":330},"piqBrief":{"overview":199,"detail":470},"piqDiscover":{"overview":199,"detail":500},"piqGate":{"overview":182,"detail":500},"piqExtract":{"overview":199,"detail":540},"piqApollo":{"overview":199,"detail":470},"piqDossier":{"overview":199,"detail":500},"piqWriter":{"overview":182,"detail":480},"piqSend":{"overview":230,"detail":540},"piqLinkedin":{"overview":199,"detail":470},"piqVault":{"overview":199,"detail":470}});
  delete H2.stubB;
  const brA = LGP_C_SPEC.branches.find(function (b) { return b.id === 'A'; });
  const brC = LGP_C_SPEC.branches.find(function (b) { return b.id === 'C'; });
  const brB = { id: 'B', dir: 'down', chain: ['piqBrief', 'piqDiscover', 'piqGate', 'piqExtract', 'piqApollo', 'piqDossier', 'piqWriter', 'piqSend'],
    forks: [{ at: 'piqExtract', lanes: [{ side: -1, chain: ['piqLinkedin'] }, { side: 1, chain: ['piqVault'] }] }] };
  const SPEC = { pattern: 'brain', hub: 'trunk', branches: [brA, brC, brB], loops: LGP_C_SPEC.loops };
  const cv2 = WF.canvasFor(SPEC, H2);
  const L = WF.layout(SPEC, H2, 'overview', { shifts: cv2.shifts });
  check(WF.inspect(L, cv2).length === 0, '2e: the unmoved layout is clean');
  // move one Branch B card to 100 units below Prospector: more than GAP_CHAIN (no V1) but less than GAP_SECTOR
  const moved = {}; Object.keys(L.cards).forEach(function (id) { moved[id] = Object.assign({}, L.cards[id]); });
  moved.piqVault.x = moved.prospector.x; moved.piqVault.y = moved.prospector.y + moved.prospector.h + 100;
  const v2 = WF.inspect(Object.assign({}, L, { cards: moved }), null);
  check(v2.some(function (x) { return x.code === 'V3_SECTOR'; }), '2e: a Branch B card 100 units from a Branch A card must raise V3_SECTOR');
  check(!v2.some(function (x) { return x.code === 'V1_CARD_GAP' && [x.a, x.b].indexOf('piqVault') >= 0 && [x.a, x.b].indexOf('prospector') >= 0; }), '2e: the moved card is still more than GAP_CHAIN from Prospector');
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

/* ---- 7. flow:'in' branches (framework 2.2.0) ---- */

/* 7a. flow:'in' moves no card and does not change the canvas */
{
  const FH = { hub: { overview: 120, detail: 160 }, i1: { overview: 150, detail: 300 }, i2: { overview: 150, detail: 300 }, i3: { overview: 150, detail: 300 } };
  const specOut = { pattern: 'brain', hub: 'hub', branches: [{ id: 'K', dir: 'left', chain: ['i3', 'i2', 'i1'] }] };
  const specIn = { pattern: 'brain', hub: 'hub', branches: [{ id: 'K', dir: 'left', flow: 'in', chain: ['i3', 'i2', 'i1'] }] };
  const cvOut = WF.canvasFor(specOut, FH), cvIn = WF.canvasFor(specIn, FH);
  check(cvOut.w === cvIn.w && cvOut.h === cvIn.h && cvOut.originX === cvIn.originX && cvOut.originY === cvIn.originY, '7a: flow:in must not change canvas');
  ['overview', 'detail'].forEach(function (m) {
    const Lout = WF.layout(specOut, FH, m, { shifts: cvOut.shifts });
    const Lin = WF.layout(specIn, FH, m, { shifts: cvIn.shifts });
    check(JSON.stringify(Lout.cards) === JSON.stringify(Lin.cards), '7a: flow:in must not move any card in ' + m);
  });
}

/* The section 5.1 RAG assistant spec, used for 7b/7c below */
const RAG_SPEC = {
  pattern: 'brain', hub: 'kb',
  branches: [
    { id: 'K', dir: 'left', flow: 'in', chain: ['organize', 'extract', 'intake'] },
    { id: 'Q', dir: 'up', flow: 'in', chain: ['narrow', 'ask'] },
    { id: 'A', dir: 'right', chain: ['team'],
      forks: [{ at: 'team', lanes: [
        { side: -1, chain: ['quick'] },
        { side: -1, chain: ['deep'] },
        { side: 1, chain: ['compare', 'shortlist'] }
      ] }] }
  ]
};
const RAG_IDS = ['kb', 'intake', 'extract', 'organize', 'ask', 'narrow', 'team', 'quick', 'deep', 'compare', 'shortlist'];
const RAG_HEIGHTS = { kb: { overview: 200, detail: 260 }, intake: { overview: 190, detail: 400 }, extract: { overview: 190, detail: 420 },
  organize: { overview: 190, detail: 410 }, ask: { overview: 182, detail: 380 }, narrow: { overview: 190, detail: 400 },
  team: { overview: 190, detail: 400 }, quick: { overview: 182, detail: 340 }, deep: { overview: 182, detail: 360 },
  compare: { overview: 182, detail: 360 }, shortlist: { overview: 182, detail: 360 } };

/* 7b. pipes on flow:'in' branches are reversed */
{
  const cv7 = WF.canvasFor(RAG_SPEC, RAG_HEIGHTS);
  ['overview', 'detail'].forEach(function (m) {
    const L = WF.layout(RAG_SPEC, RAG_HEIGHTS, m, { shifts: cv7.shifts });
    const ids = L.pipes.map(function (p) { return p.id; });
    ['intake__extract', 'extract__organize', 'organize__kb', 'ask__narrow', 'narrow__kb'].forEach(function (id) {
      check(ids.indexOf(id) >= 0, '7b: reversed pipe ' + id + ' must exist in ' + m);
    });
    ['kb__organize', 'kb__narrow', 'organize__extract', 'narrow__ask'].forEach(function (id) {
      check(ids.indexOf(id) < 0, '7b: forward pipe ' + id + ' must not exist in ' + m);
    });
  });
}

/* 7c. the RAG spec is clean: fixed heights, then >= 200 random height sets in both modes */
{
  const cv7 = WF.canvasFor(RAG_SPEC, RAG_HEIGHTS);
  ['overview', 'detail'].forEach(function (m) {
    const v = WF.inspect(WF.layout(RAG_SPEC, RAG_HEIGHTS, m, { shifts: cv7.shifts }), cv7);
    check(v.length === 0, '7c: RAG spec fixed-heights ' + m + ' violations: ' + JSON.stringify(v));
  });
  let ragRuns = 0, ragBad = 0;
  for (let t = 0; t < 200; t++) {
    const H = {};
    RAG_IDS.forEach(function (id) {
      const ov = ri(150, 240), dt = ov + ri(180, 440);
      H[id] = { overview: ov, detail: dt };
    });
    const c = WF.canvasFor(RAG_SPEC, H);
    ['overview', 'detail'].forEach(function (m) {
      ragRuns++;
      const v = WF.inspect(WF.layout(RAG_SPEC, H, m, { shifts: c.shifts }), c);
      if (v.length) { ragBad++; if (ragBad <= 3) failures.push('7c: random RAG heights ' + m + ': ' + JSON.stringify(v.slice(0, 2))); }
    });
  }
  check(ragBad === 0, '7c: random RAG height sets with violations: ' + ragBad + ' of ' + ragRuns);
}

/* 7d. refusals: flow:'in' + forks, and a loop naming a card on a flow:'in' branch */
{
  const FH = { hub: { overview: 120, detail: 160 }, i1: { overview: 150, detail: 300 }, i2: { overview: 150, detail: 300 } };
  const specForkIn = { pattern: 'brain', hub: 'hub', branches: [{ id: 'K', dir: 'left', flow: 'in', chain: ['i2', 'i1'],
    forks: [{ at: 'i1', lanes: [{ side: -1, chain: ['i2'] }] }] }] };
  let threw = false;
  try { WF.canvasFor(specForkIn, FH); } catch (e) { threw = true; }
  check(threw, '7d: a flow:in branch with forks must throw');

  const specLoopIn = { pattern: 'brain', hub: 'hub',
    branches: [{ id: 'K', dir: 'left', flow: 'in', chain: ['i2', 'i1'] }],
    loops: [{ from: 'i2', to: 'i1' }] };
  threw = false;
  try { WF.canvasFor(specLoopIn, FH); } catch (e) { threw = true; }
  check(threw, '7d: a loop naming a card on a flow:in branch must throw');
}

if (failures.length) {
  console.error('framework_unit.js: ' + failures.length + ' failure(s):');
  failures.forEach(function (f) { console.error('  - ' + f); });
  process.exit(1);
}
console.log('framework_unit.js: all checks passed (' + brainRuns + ' brain, ' + midRuns + ' mid-animation, ' + lineRuns + ' line layouts, ' + rejected + ' bad loops rejected).');
