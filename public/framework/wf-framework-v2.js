/* Workflow Library Framework v2
   LAYOUT CORE (pure, no DOM): tokens, patterns (brain, line), pipes, dots, canvas, inspector.
   Validated in the design session on 2026-09-17: real LeadGenPro heights plus 36,000 random brain
   layouts, 36,000 staggered mid-animation frames and 12,000 line layouts, zero violations.
   Spec: FRAMEWORK.md. Do not change the math without updating FRAMEWORK.md and tests/framework_unit.js.
   The DOM RUNTIME (WF.mount) lives inside this same factory, just before the final return. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.WF = factory(); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = '2.1.0';

  var TOKENS = Object.freeze({
    CARD_W: 170,        // every normal card
    HUB_W: 340,         // hub / satellite (wide horizontal card)
    GAP_CHAIN: 72,      // card to next card, lane to lane (the base rhythm)
    GAP_BRANCH: 90,     // hub to first card, fork card to its lane column, satellite above to row
    GAP_LOOP: 45,       // feedback loop lowest point below the lowest card it passes
    GAP_SECTOR: 120,    // minimum clearance between two different branches
    PORT_OFFSET: 40,    // horizontal-flow pipe port: distance from card top
    CANVAS_PAD: 56,
    DOT_SPACING: 18, DOT_MIN: 2, DOT_MAX: 10,
    DOT_SPEED_BASE: 8.64, DOT_JITTER: 0.25, DOT_R: 3.2,
    SIM_SPEED_DEFAULT: 1.4,
    MODE_ANIM_MS: 450,
    DRAG_THRESHOLD_PX: 4
  });
  var T = TOKENS;

  function H(heights, id, mode) {
    var h = heights[id];
    if (h == null) throw new Error('WF: no height for card "' + id + '"');
    if (typeof h === 'number') return h;
    var v = h[mode];
    if (typeof v !== 'number') throw new Error('WF: no ' + mode + ' height for card "' + id + '"');
    return v;
  }
  function rect(x, y, w, h) { return { x: x, y: y, w: w, h: h }; }
  function right(r) { return r.x + r.w; }
  function bottom(r) { return r.y + r.h; }

  /* ---------------- BRAIN pattern ---------------- */
  var DIRS = { right: 'h', left: 'h', down: 'v', up: 'v' };

  function layoutBranch(br, hubRect, heights, mode, cards, flow) {
    var dir = br.dir, orient = DIRS[dir];
    if (!orient) throw new Error('WF: bad dir "' + dir + '" on branch ' + br.id);
    var sgn = (dir === 'right' || dir === 'down') ? 1 : -1;
    var ids = [];

    function place(id, r, branchId, role) {
      if (cards[id]) throw new Error('WF: card "' + id + '" placed twice');
      r.id = id; r.branch = branchId; r.role = role; r.flow = orient;
      cards[id] = r; ids.push(id);
      return r;
    }

    // main chain
    var chain = br.chain || [];
    if (!chain.length) throw new Error('WF: branch ' + br.id + ' has an empty chain');
    var prev = null;
    chain.forEach(function (id, i) {
      var h = H(heights, id, mode), r;
      if (orient === 'h') {
        var lead = (i === 0) ? (hubRect.w / 2 + T.GAP_BRANCH) : null;
        var x;
        if (sgn > 0) x = (i === 0) ? lead : right(prev) + T.GAP_CHAIN;
        else x = (i === 0) ? -lead - T.CARD_W : prev.x - T.GAP_CHAIN - T.CARD_W;
        r = rect(x, -T.PORT_OFFSET, T.CARD_W, h);
      } else {
        var y;
        if (sgn > 0) y = (i === 0) ? hubRect.h / 2 + T.GAP_BRANCH : bottom(prev) + T.GAP_CHAIN;
        else y = (i === 0) ? -hubRect.h / 2 - T.GAP_BRANCH - h : prev.y - T.GAP_CHAIN - h;
        r = rect(-T.CARD_W / 2, y, T.CARD_W, h);
      }
      place(id, r, br.id, 'main');
      flow.push({ from: i === 0 ? '__hub__' : chain[i - 1], to: id, kind: i === 0 ? 'trunk-branch' : 'main', orient: orient, sgn: sgn });
      prev = r;
    });

    // forks
    (br.forks || []).forEach(function (fk) {
      var k = chain.indexOf(fk.at);
      if (k < 0) throw new Error('WF: fork at "' + fk.at + '" is not on the main chain of branch ' + br.id + ' (forks inside lanes need a design pass)');
      var src = cards[fk.at];
      var continues = k < chain.length - 1;
      var gap = continues ? T.GAP_CHAIN : T.GAP_BRANCH;
      var sideStack = { '-1': null, '1': null };   // last placed lane extent per side
      var laneDepth = { '-1': -1, '1': -1 };        // 0 = innermost lane on that side

      fk.lanes.forEach(function (lane) {
        var side = lane.side;
        if (side !== -1 && side !== 1) throw new Error('WF: lane side must be -1 or +1');
        var lc = lane.chain || [];
        if (!lc.length) throw new Error('WF: empty lane at fork ' + fk.at);
        var maxH = 0; lc.forEach(function (id) { maxH = Math.max(maxH, H(heights, id, mode)); });
        laneDepth[String(side)] += 1;

        if (orient === 'h') {
          var startX = sgn > 0 ? right(src) + gap : src.x - gap;
          var laneW = lc.length * T.CARD_W + (lc.length - 1) * T.GAP_CHAIN;
          var x0 = sgn > 0 ? startX : startX - laneW;
          var x1 = x0 + laneW;
          // band = main cards overlapping this lane's x-range
          var bandTop = null, bandBot = null;
          chain.forEach(function (cid) {
            var c = cards[cid];
            if (c.x < x1 + T.GAP_CHAIN && right(c) > x0 - T.GAP_CHAIN) {
              bandTop = bandTop == null ? c.y : Math.min(bandTop, c.y);
              bandBot = bandBot == null ? bottom(c) : Math.max(bandBot, bottom(c));
            }
          });
          var top;
          var last = sideStack[String(side)];
          if (side < 0) {
            var limit = last ? last.top - T.GAP_CHAIN : (bandTop == null ? -T.GAP_CHAIN / 2 : bandTop - T.GAP_CHAIN);
            top = limit - maxH;
            sideStack['-1'] = { top: top };
          } else {
            top = last ? last.bottom + T.GAP_CHAIN : (bandBot == null ? T.GAP_CHAIN / 2 : bandBot + T.GAP_CHAIN);
            sideStack['1'] = { bottom: top + maxH };
          }
          lc.forEach(function (id, j) {
            var h = H(heights, id, mode);
            var x = sgn > 0 ? x0 + j * (T.CARD_W + T.GAP_CHAIN) : x1 - T.CARD_W - j * (T.CARD_W + T.GAP_CHAIN);
            // side -1 (above): bottom-aligned so the card grows upward and its port never moves
            var y = side < 0 ? top + maxH - h : top;
            var lr = place(id, rect(x, y, T.CARD_W, h), br.id, 'lane');
            lr.portFromBottom = side < 0;
            lr.laneSide = side; lr.forkAt = fk.at; lr.laneDepth = laneDepth[String(side)];
            flow.push({ from: j === 0 ? fk.at : lc[j - 1], to: id, kind: j === 0 ? 'sub' : 'linear', orient: orient, sgn: sgn });
          });
        } else {
          var startY = sgn > 0 ? bottom(src) + gap : src.y - gap;
          // stacked heights of this lane
          var hs = lc.map(function (id) { return H(heights, id, mode); });
          var laneH = hs.reduce(function (a, b) { return a + b; }, 0) + (lc.length - 1) * T.GAP_CHAIN;
          var y0 = sgn > 0 ? startY : startY - laneH, y1 = y0 + laneH;
          // band is STRUCTURAL (never height-dependent, so lanes never jump sideways mid-animation):
          // if the main chain continues past the fork, lanes run beside the main column.
          var bandL = continues ? -T.CARD_W / 2 : null, bandR = continues ? T.CARD_W / 2 : null;
          var left;
          var lastV = sideStack[String(side)];
          if (side < 0) {
            var lim = lastV ? lastV.left - T.GAP_CHAIN : (bandL == null ? -T.GAP_CHAIN / 2 : bandL - T.GAP_CHAIN);
            left = lim - T.CARD_W;
            sideStack['-1'] = { left: left };
          } else {
            left = lastV ? lastV.right + T.GAP_CHAIN : (bandR == null ? T.GAP_CHAIN / 2 : bandR + T.GAP_CHAIN);
            sideStack['1'] = { right: left + T.CARD_W };
          }
          var cursor = sgn > 0 ? y0 : y1;
          lc.forEach(function (id, j) {
            var h = hs[j], y;
            if (sgn > 0) { y = cursor; cursor = y + h + T.GAP_CHAIN; }
            else { y = cursor - h; cursor = y - T.GAP_CHAIN; }
            var lv = place(id, rect(left, y, T.CARD_W, h), br.id, 'lane');
            lv.laneSide = side; lv.forkAt = fk.at; lv.laneDepth = laneDepth[String(side)];
            flow.push({ from: j === 0 ? fk.at : lc[j - 1], to: id, kind: j === 0 ? 'sub' : 'linear', orient: orient, sgn: sgn });
          });
        }
      });
    });
    // remember outermost depth per fork+side for loop validation
    (br.forks || []).forEach(function (fk) {
      var cnt = { '-1': 0, '1': 0 };
      fk.lanes.forEach(function (ln) { cnt[String(ln.side)] += 1; });
      fk.lanes.forEach(function (ln) { ln.chain.forEach(function (id) { cards[id].laneOuter = cards[id].laneDepth === cnt[String(ln.side)] - 1; }); });
    });
    ids.dir = dir; ids.chain = chain; ids.forks = br.forks || [];
    return ids;
  }

  function envelopeOf(ids, cards) {
    var e = null;
    ids.forEach(function (id) {
      var c = cards[id];
      if (!e) e = { x0: c.x, y0: c.y, x1: right(c), y1: bottom(c) };
      else { e.x0 = Math.min(e.x0, c.x); e.y0 = Math.min(e.y0, c.y); e.x1 = Math.max(e.x1, right(c)); e.y1 = Math.max(e.y1, bottom(c)); }
    });
    return e;
  }
  function envGap(a, b) {
    var dx = Math.max(b.x0 - a.x1, a.x0 - b.x1, 0);
    var dy = Math.max(b.y0 - a.y1, a.y0 - b.y1, 0);
    var ox = !(b.x0 >= a.x1 || a.x0 >= b.x1), oy = !(b.y0 >= a.y1 || a.y0 >= b.y1);
    if (ox && oy) return -1;
    if (ox) return dy;
    if (oy) return dx;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // Branch clearance on REAL geometry (the branch's cards + its own pipes), not the branch's bounding rectangle.
  // card vs card and card vs pipe must keep GAP_SECTOR; pipe vs pipe is not checked (every trunk pipe meets at the hub).
  function branchGeom(raw, bid, loops) {
    var ids = raw.branchIds[bid], set = {};
    ids.forEach(function (id) { set[id] = true; });
    var boxes = ids.map(function (id) { var c = raw.cards[id]; return { x0: c.x, y0: c.y, x1: c.x + c.w, y1: c.y + c.h }; });
    var pts = [];
    raw.flow.forEach(function (f) { if (set[f.to]) samplePipe(buildPipe(f, raw.cards), 32).forEach(function (q) { pts.push({ x0: q.x, y0: q.y, x1: q.x, y1: q.y }); }); });
    (loops || []).forEach(function (lp) { if (set[lp.from]) samplePipe(buildLoop(lp, raw.cards), 32).forEach(function (q) { pts.push({ x0: q.x, y0: q.y, x1: q.x, y1: q.y }); }); });
    return { boxes: boxes, pts: pts };
  }
  function geomGap(A, B) {
    var g = Infinity;
    A.boxes.forEach(function (a) {
      B.boxes.forEach(function (b) { g = Math.min(g, envGap(a, b)); });
      B.pts.forEach(function (b) { g = Math.min(g, envGap(a, b)); });
    });
    B.boxes.forEach(function (b) { A.pts.forEach(function (a) { g = Math.min(g, envGap(a, b)); }); });
    return g;
  }

  function shiftCards(ids, cards, dx, dy) { ids.forEach(function (id) { cards[id].x += dx; cards[id].y += dy; }); }

  function brainRaw(spec, heights, mode, shifts) {
    var cards = {}, flow = [];
    var hubH = H(heights, spec.hub, mode);
    var hub = rect(-T.HUB_W / 2, -hubH / 2, T.HUB_W, hubH);
    hub.id = spec.hub; hub.branch = null; hub.role = 'hub'; hub.flow = null;
    cards[spec.hub] = hub;
    var branchIds = {};
    spec.branches.forEach(function (br) {
      branchIds[br.id] = layoutBranch(br, hub, heights, mode, cards, flow);
      var s = shifts && shifts[br.id];
      if (s) shiftCards(branchIds[br.id], cards, s.dx, s.dy);
    });
    flow.forEach(function (f) { if (f.from === '__hub__') f.from = spec.hub; });
    return { cards: cards, flow: flow, branchIds: branchIds, hub: hub };
  }

  // Branch shifts are computed ONCE, checked against BOTH modes, then applied to both modes.
  function computeShifts(spec, heights) {
    var shifts = {};
    spec.branches.forEach(function (br) { shifts[br.id] = { dx: 0, dy: 0 }; });
    for (var bi = 1; bi < spec.branches.length; bi++) {
      var br = spec.branches[bi];
      for (var iter = 0; iter < 400; iter++) {
        var need = 0;
        var raws = { overview: brainRaw(spec, heights, 'overview', shifts), detail: brainRaw(spec, heights, 'detail', shifts) };
        // 4 combinations (this branch in either mode vs earlier branches in either mode) so staggered
        // mid-animation frames can never bring two branches closer than GAP_SECTOR
        [['overview', 'overview'], ['overview', 'detail'], ['detail', 'overview'], ['detail', 'detail']].forEach(function (mm) {
          var B = envelopeOf(raws[mm[0]].branchIds[br.id], raws[mm[0]].cards);
          for (var ei = 0; ei < bi; ei++) {
            var E = envelopeOf(raws[mm[1]].branchIds[spec.branches[ei].id], raws[mm[1]].cards);
            var g = geomGap(branchGeom(raws[mm[0]], br.id, spec.loops), branchGeom(raws[mm[1]], spec.branches[ei].id, spec.loops));
            if (g >= T.GAP_SECTOR - 0.5) continue;
            var p;
            if (br.dir === 'down') p = E.y1 + T.GAP_SECTOR - B.y0;
            else if (br.dir === 'up') p = B.y1 - (E.y0 - T.GAP_SECTOR);
            else if (br.dir === 'right') p = E.x1 + T.GAP_SECTOR - B.x0;
            else p = B.x1 - (E.x0 - T.GAP_SECTOR);
            // real geometry apart but too close: step outward by exactly the missing clearance (the loop re-checks);
            // overlapping geometry: jump by the envelope distance, or step outward on a corner case (p <= 0)
            if (g >= 0) need = Math.max(need, T.GAP_SECTOR - g);
            else need = Math.max(need, p > 0 ? p : T.GAP_SECTOR);
          }
        });
        if (need <= 0) break;
        var s = shifts[br.id], step = Math.ceil(need);
        if (br.dir === 'right') s.dx += step; else if (br.dir === 'left') s.dx -= step;
        else if (br.dir === 'down') s.dy += step; else s.dy -= step;
        if (iter === 399) throw new Error('WF: could not clear branch ' + br.id + ' from earlier branches (needs a design pass)');
      }
    }
    return shifts;
  }

  /* ---------------- LINE pattern ---------------- */
  function lineRaw(spec, heights, mode) {
    var cards = {}, flow = [];
    var row = spec.chain;
    row.forEach(function (id, i) {
      var r = rect(i * (T.CARD_W + T.GAP_CHAIN), 0, T.CARD_W, H(heights, id, mode));
      r.id = id; r.branch = 'row'; r.role = 'main'; r.flow = 'h';
      cards[id] = r;
      if (i > 0) flow.push({ from: row[i - 1], to: id, kind: 'main', orient: 'h', sgn: 1 });
    });
    var rowX0 = 0, rowX1 = right(cards[row[row.length - 1]]);
    if (spec.above) {
      var a = spec.above, aw = a.width || T.HUB_W, ah = H(heights, a.id, mode);
      var acx = a.over ? cards[a.over].x + T.CARD_W / 2 : (rowX0 + rowX1) / 2;
      var ar = rect(acx - aw / 2, -T.GAP_BRANCH - ah, aw, ah);
      ar.id = a.id; ar.branch = 'above'; ar.role = 'satellite'; ar.flow = 'v';
      cards[a.id] = ar;
      if (a.connect === 'each') {
        row.forEach(function (id, i) {
          flow.push({ from: a.id, to: id, kind: 'control', orient: 'v', sgn: 1, portIndex: i, portCount: row.length });
        });
      }
    }
    (spec.below || []).forEach(function (b) {
      var bw = b.width || T.CARD_W, bh = H(heights, b.id, mode);
      var bcx = b.under ? cards[b.under].x + T.CARD_W / 2 : (rowX0 + rowX1) / 2;
      var bx0 = bcx - bw / 2, bx1 = bx0 + bw, lowest = 0;
      // clearance zone: any row card within GAP_CHAIN of the satellite's x-range counts
      row.forEach(function (id) { var c = cards[id]; if (c.x < bx1 + T.GAP_CHAIN && right(c) > bx0 - T.GAP_CHAIN) lowest = Math.max(lowest, bottom(c)); });
      var br = rect(bx0, lowest + T.GAP_CHAIN, bw, bh);
      br.id = b.id; br.branch = 'below'; br.role = 'satellite'; br.flow = 'v';
      cards[b.id] = br;
    });
    (spec.edges || []).forEach(function (e) { flow.push({ from: e.from, to: e.to, kind: e.kind || 'branch', orient: e.orient || 'v', sgn: 1 }); });
    return { cards: cards, flow: flow };
  }

  /* ---------------- pipes ---------------- */
  function bez(p0, p1, p2, p3, t) {
    var u = 1 - t;
    return { x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
             y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y };
  }

  function portY(c) {
    if (c.role === 'hub') return c.y + c.h / 2;
    return c.portFromBottom ? bottom(c) - T.PORT_OFFSET : c.y + T.PORT_OFFSET;
  }

  function buildPipe(f, cards) {
    var a = cards[f.from], b = cards[f.to];
    if (!a || !b) throw new Error('WF: pipe references unknown card ' + f.from + ' -> ' + f.to);
    var p0, p3, p1, p2, c;
    if (f.kind === 'control') {
      p0 = { x: a.x + (f.portIndex + 0.5) * a.w / f.portCount, y: bottom(a) };
      p3 = { x: b.x + b.w / 2, y: b.y };
      c = Math.max((p3.y - p0.y) * 0.5, 24);
      p1 = { x: p0.x, y: p0.y + c }; p2 = { x: p3.x, y: p3.y - c };
    } else if (f.orient === 'h') {
      var fromRightSide = (b.x + b.w / 2) >= (a.x + a.w / 2);
      var aPortY = portY(a), bPortY = portY(b);
      p0 = { x: fromRightSide ? right(a) : a.x, y: aPortY };
      p3 = { x: fromRightSide ? b.x : right(b), y: bPortY };
      c = Math.max(Math.abs(p3.x - p0.x) * 0.5, 24) * (fromRightSide ? 1 : -1);
      p1 = { x: p0.x + c, y: p0.y }; p2 = { x: p3.x - c, y: p3.y };
    } else {
      var downward = (b.y + b.h / 2) >= (a.y + a.h / 2);
      p0 = { x: a.x + a.w / 2, y: downward ? bottom(a) : a.y };
      p3 = { x: b.x + b.w / 2, y: downward ? b.y : bottom(b) };
      c = Math.max(Math.abs(p3.y - p0.y) * 0.5, 24) * (downward ? 1 : -1);
      p1 = { x: p0.x, y: p0.y + c }; p2 = { x: p3.x, y: p3.y - c };
    }
    return { id: f.from + '__' + f.to, from: f.from, to: f.to, kind: f.kind, segs: [[p0, p1, p2, p3]] };
  }

  function lineSeg(a, b) {
    return [a, { x: a.x + (b.x - a.x) / 3, y: a.y + (b.y - a.y) / 3 }, { x: a.x + 2 * (b.x - a.x) / 3, y: a.y + 2 * (b.y - a.y) / 3 }, b];
  }
  // quarter-circle corner from a (moving along its axis) to b, approximated by one cubic
  function cornerSeg(a, corner, b) {
    var K = 0.5523;
    return [a, { x: a.x + (corner.x - a.x) * K, y: a.y + (corner.y - a.y) * K }, { x: b.x + (corner.x - b.x) * K, y: b.y + (corner.y - b.y) * K }, b];
  }

  // Feedback loops are ORTHOGONAL (metro-line style): straight out of the lane card, straight across
  // below (or above) everything in the branch, straight back into the main card. Clearance is guaranteed.
  function buildLoop(lp, cards) {
    var a = cards[lp.from], b = cards[lp.to];
    if (!a || !b) throw new Error('WF: loop references unknown card ' + lp.from + ' -> ' + lp.to);
    if (a.role !== 'lane' || a.flow !== 'h' || !a.laneOuter) {
      throw new Error('WF: loop from "' + lp.from + '" must start on the OUTERMOST lane of a left/right branch (anything else needs a design pass)');
    }
    if (b.role !== 'main' || b.branch !== a.branch) throw new Error('WF: loop must return to a main-chain card of the same branch');
    var side = a.laneSide;
    var xa = a.x + a.w / 2, xb = b.x + b.w / 2;
    var lo = Math.min(a.x, b.x) - T.GAP_CHAIN, hi = Math.max(right(a), right(b)) + T.GAP_CHAIN;
    var ext = side > 0 ? -Infinity : Infinity;
    Object.keys(cards).forEach(function (id) {
      var c = cards[id];
      if (c.branch !== a.branch) return;               // other branches sit >= GAP_SECTOR away
      if (c.x < hi && right(c) > lo) ext = side > 0 ? Math.max(ext, bottom(c)) : Math.min(ext, c.y);
    });
    var dip = side > 0 ? ext + T.GAP_LOOP : ext - T.GAP_LOOP;
    var ya = side > 0 ? bottom(a) : a.y, yb = side > 0 ? bottom(b) : b.y;
    var dirX = xb < xa ? -1 : 1;
    var r = Math.max(0, Math.min(24, Math.abs(dip - ya) / 2, Math.abs(dip - yb) / 2, Math.abs(xb - xa) / 2));
    var sy = side > 0 ? 1 : -1;
    var P1 = { x: xa, y: ya }, P2 = { x: xa, y: dip - sy * r }, C1 = { x: xa, y: dip }, P3 = { x: xa + dirX * r, y: dip };
    var P4 = { x: xb - dirX * r, y: dip }, C2 = { x: xb, y: dip }, P5 = { x: xb, y: dip - sy * r }, P6 = { x: xb, y: yb };
    var segs = [lineSeg(P1, P2), cornerSeg(P2, C1, P3), lineSeg(P3, P4), cornerSeg(P4, C2, P5), lineSeg(P5, P6)];
    return { id: lp.from + '__' + lp.to, from: lp.from, to: lp.to, kind: 'feedback', segs: segs };
  }

  // n samples PER SEGMENT (segment endpoints shared)
  function samplePipe(pipe, n) {
    var out = [];
    pipe.segs.forEach(function (S, si) {
      for (var i = (si === 0 ? 0 : 1); i <= n; i++) out.push(bez(S[0], S[1], S[2], S[3], i / n));
    });
    return out;
  }
  function pipeLength(pipe) {
    var s = samplePipe(pipe, 48), L = 0;
    for (var i = 1; i < s.length; i++) L += Math.hypot(s[i].x - s[i - 1].x, s[i].y - s[i - 1].y);
    return L;
  }
  function pipePath(pipe) {
    function f(v) { return Math.round(v * 100) / 100; }
    var S0 = pipe.segs[0][0], d = 'M' + f(S0.x) + ',' + f(S0.y);
    pipe.segs.forEach(function (S) { d += ' C' + f(S[1].x) + ',' + f(S[1].y) + ' ' + f(S[2].x) + ',' + f(S[2].y) + ' ' + f(S[3].x) + ',' + f(S[3].y); });
    return d;
  }
  function dotCount(len) { return Math.max(T.DOT_MIN, Math.min(T.DOT_MAX, Math.round(len / T.DOT_SPACING))); }
  function carriesDots(kind) { return kind !== 'feedback' && kind !== 'control'; }

  /* ---------------- public layout ---------------- */
  function layout(spec, heights, mode, opts) {
    opts = opts || {};
    if (mode !== 'overview' && mode !== 'detail') throw new Error('WF: mode must be overview or detail');
    var raw, envelopes = null;
    if (spec.pattern === 'brain') {
      var shifts = opts.shifts || computeShifts(spec, heights);
      raw = brainRaw(spec, heights, mode, shifts);
      envelopes = {};
      Object.keys(raw.branchIds).forEach(function (bid) { envelopes[bid] = envelopeOf(raw.branchIds[bid], raw.cards); envelopes[bid].ids = raw.branchIds[bid]; });
    } else if (spec.pattern === 'line') {
      raw = lineRaw(spec, heights, mode);
    } else {
      throw new Error('WF: unknown pattern "' + spec.pattern + '"');
    }
    var loops = spec.loops || [];
    var pipes = buildAllPipes(raw.flow, loops, raw.cards);
    return { pattern: spec.pattern, mode: mode, cards: raw.cards, pipes: pipes, envelopes: envelopes, flow: raw.flow, loops: loops };
  }

  function buildAllPipes(flow, loops, cards) {
    var pipes = flow.map(function (f) { return buildPipe(f, cards); });
    loops.forEach(function (lp) { pipes.push(buildLoop(lp, cards)); });
    pipes.forEach(function (p) { p.len = pipeLength(p); p.dots = carriesDots(p.kind) ? dotCount(p.len) : 0; });
    return pipes;
  }

  // Drag support: same layout, cards moved by per-card offsets {id:{dx,dy}}, pipes rebuilt on the moved cards.
  // The inspector is NEVER run on this result (a user may drag cards on top of each other on purpose).
  function withOffsets(L, offsets) {
    var cards = {};
    Object.keys(L.cards).forEach(function (id) {
      var c = L.cards[id], o = (offsets && offsets[id]) || { dx: 0, dy: 0 };
      var copy = {}; Object.keys(c).forEach(function (k) { copy[k] = c[k]; });
      copy.x = c.x + o.dx; copy.y = c.y + o.dy;
      cards[id] = copy;
    });
    return { pattern: L.pattern, mode: L.mode, cards: cards, pipes: buildAllPipes(L.flow, L.loops, cards), envelopes: null, flow: L.flow, loops: L.loops, dragged: true };
  }

  // Canvas: union of content bounds across BOTH modes + pad, for every pattern (stable size, best fit zoom).
  function canvasFor(spec, heights) {
    var shifts = spec.pattern === 'brain' ? computeShifts(spec, heights) : null;
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    ['overview', 'detail'].forEach(function (m) {
      var L = layout(spec, heights, m, { shifts: shifts });
      Object.keys(L.cards).forEach(function (id) {
        var c = L.cards[id];
        x0 = Math.min(x0, c.x); y0 = Math.min(y0, c.y); x1 = Math.max(x1, right(c)); y1 = Math.max(y1, bottom(c));
      });
      L.pipes.forEach(function (p) {
        samplePipe(p, 32).forEach(function (s) { x0 = Math.min(x0, s.x); y0 = Math.min(y0, s.y); x1 = Math.max(x1, s.x); y1 = Math.max(y1, s.y); });
      });
    });
    var pad = T.CANVAS_PAD + T.DOT_R;
    return { w: Math.ceil(x1 - x0 + 2 * pad), h: Math.ceil(y1 - y0 + 2 * pad), originX: Math.ceil(pad - x0), originY: Math.ceil(pad - y0), shifts: shifts };
  }

  /* ---------------- inspector ---------------- */
  function cardGap(a, b) {
    return envGap({ x0: a.x, y0: a.y, x1: right(a), y1: bottom(a) }, { x0: b.x, y0: b.y, x1: right(b), y1: bottom(b) });
  }

  function inspect(L, canvas) {
    var v = [];
    var ids = Object.keys(L.cards);
    // V1 card gap
    for (var i = 0; i < ids.length; i++) {
      for (var j = i + 1; j < ids.length; j++) {
        var g = cardGap(L.cards[ids[i]], L.cards[ids[j]]);
        if (g < T.GAP_CHAIN - 0.5) v.push({ code: 'V1_CARD_GAP', a: ids[i], b: ids[j], detail: 'gap ' + Math.round(g) + ' < ' + T.GAP_CHAIN });
      }
    }
    // V2 pipe through card
    L.pipes.forEach(function (p) {
      var pts = samplePipe(p, 32);
      ids.forEach(function (id) {
        if (id === p.from || id === p.to) return;
        var c = L.cards[id];
        for (var k = 0; k < pts.length; k++) {
          var s = pts[k];
          if (s.x > c.x + 2 && s.x < right(c) - 2 && s.y > c.y + 2 && s.y < bottom(c) - 2) {
            v.push({ code: 'V2_PIPE_THROUGH_CARD', a: p.id, b: id, detail: 'sample ' + k });
            break;
          }
        }
      });
    });
    // V3 sector
    if (L.envelopes) {
      var bids = Object.keys(L.envelopes);
      var rawL = { cards: L.cards, flow: L.flow, branchIds: {} };
      bids.forEach(function (k) { rawL.branchIds[k] = L.envelopes[k].ids; });
      for (var a = 0; a < bids.length; a++) {
        for (var b = a + 1; b < bids.length; b++) {
          var eg = geomGap(branchGeom(rawL, bids[a], L.loops), branchGeom(rawL, bids[b], L.loops));
          if (eg < T.GAP_SECTOR - 0.5) v.push({ code: 'V3_SECTOR', a: bids[a], b: bids[b], detail: 'gap ' + Math.round(eg) + ' < ' + T.GAP_SECTOR });
        }
      }
    }
    // V4 short dot pipes
    L.pipes.forEach(function (p) {
      if (p.dots > 0 && p.len < 0.9 * T.GAP_CHAIN) v.push({ code: 'V4_SHORT_PIPE', a: p.id, detail: 'len ' + Math.round(p.len) });
    });
    // V5 port on card
    ids.forEach(function (id) {
      var c = L.cards[id];
      if (c.flow === 'h' && c.role !== 'hub' && T.PORT_OFFSET > c.h - 8) v.push({ code: 'V5_PORT_OFF_CARD', a: id, detail: 'height ' + c.h });
    });
    // V6 canvas
    if (canvas) {
      ids.forEach(function (id) {
        var c = L.cards[id];
        var X = c.x + canvas.originX, Y = c.y + canvas.originY;
        if (X < 0 || Y < 0 || X + c.w > canvas.w || Y + c.h > canvas.h) v.push({ code: 'V6_OUTSIDE_CANVAS', a: id });
      });
    }
    return v;
  }

  /* ---------------- DOM RUNTIME (browser only) ---------------- */
  /* Nothing below touches document or window at load time, only inside mount(), so the file
     stays require-able from Node for tests/framework_unit.js. */

  var SVG_NS = 'http://www.w3.org/2000/svg';

  // Exact CSS cubic-bezier(.4,0,.2,1), so the runtime replays the page's own CSS timeline.
  function makeEase(x1, y1, x2, y2) {
    function bx(t) { var u = 1 - t; return 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t; }
    function by(t) { var u = 1 - t; return 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t; }
    function dbx(t) { var u = 1 - t; return 3 * u * u * x1 + 6 * u * t * (x2 - x1) + 3 * t * t * (1 - x2); }
    return function (x) {
      if (x <= 0) return 0; if (x >= 1) return 1;
      var t = x;
      for (var i = 0; i < 8; i++) { var d = dbx(t); if (Math.abs(d) < 1e-6) break; t -= (bx(t) - x) / d; t = Math.min(1, Math.max(0, t)); }
      return by(t);
    };
  }

  function ensureMarkers(svg) {
    var doc = svg.ownerDocument;
    var defs = svg.querySelector('defs');
    if (!defs) { defs = doc.createElementNS(SVG_NS, 'defs'); svg.insertBefore(defs, svg.firstChild); }
    [['mArrowMain', 'arrow-fill-main'], ['mArrowOk', 'arrow-fill-ok']].forEach(function (m) {
      if (svg.querySelector('#' + m[0])) return;
      var mk = doc.createElementNS(SVG_NS, 'marker');
      mk.setAttribute('id', m[0]);
      mk.setAttribute('viewBox', '0 0 10 10');
      mk.setAttribute('refX', '8');
      mk.setAttribute('refY', '5');
      mk.setAttribute('markerWidth', '6');
      mk.setAttribute('markerHeight', '6');
      mk.setAttribute('orient', 'auto-start-reverse');
      var p = doc.createElementNS(SVG_NS, 'path');
      p.setAttribute('d', 'M0,0 L10,5 L0,10 Z');
      p.setAttribute('class', m[1]);
      mk.appendChild(p);
      defs.appendChild(mk);
    });
  }

  function mount(o) {
    var spec = o.spec;
    var heights = o.heights;
    var canvasInner = o.canvasInner;
    var svg = o.svg;
    var cardEl = o.cardEl;
    var getZoom = o.getZoom || function () { return 1; };
    var simSpeed = typeof o.simSpeed === 'number' ? o.simSpeed : T.SIM_SPEED_DEFAULT;
    var workflowId = o.workflowId || 'workflow';
    var resetButton = o.resetButton || null;
    var onDragStart = o.onDragStart || null;
    var doc = canvasInner.ownerDocument;
    var win = doc.defaultView;
    var storeKey = 'wflib.v2.drag.' + workflowId;

    function nowMs() { return (win.performance && win.performance.now) ? win.performance.now() : Date.now(); }

    /* ---- setup ---- */
    var canvas = canvasFor(spec, heights);

    canvasInner.style.width = canvas.w + 'px';
    canvasInner.style.height = canvas.h + 'px';
    svg.setAttribute('width', canvas.w);
    svg.setAttribute('height', canvas.h);
    svg.setAttribute('viewBox', '0 0 ' + canvas.w + ' ' + canvas.h);

    ensureMarkers(svg);

    var pipeLayer = doc.createElementNS(SVG_NS, 'g');
    pipeLayer.setAttribute('id', 'wfPipes');
    pipeLayer.setAttribute('transform', 'translate(' + canvas.originX + ',' + canvas.originY + ')');
    svg.appendChild(pipeLayer);

    var ease = makeEase(0.4, 0, 0.2, 1);

    var mode = 'overview';
    var cur = {};
    Object.keys(heights).forEach(function (id) { cur[id] = H(heights, id, 'overview'); });
    var anim = null;
    var offsets = loadOffsets();
    var pipeEls = {};

    var rep = {
      framework: VERSION, workflow: workflowId, mode: mode, settled: false, ok: true,
      violations: [], simSpeed: simSpeed,
      canvas: { w: canvas.w, h: canvas.h, originX: canvas.originX, originY: canvas.originY },
      cards: {}, pipes: [], dragged: Object.keys(offsets)
    };
    function publish() { win.__wfLayoutReport = rep; }

    function asBoth(h) {
      var out = {};
      Object.keys(h).forEach(function (id) { out[id] = { overview: h[id], detail: h[id] }; });
      return out;
    }
    function currentLayout() { return layout(spec, asBoth(cur), 'overview', { shifts: canvas.shifts }); }
    function anyOffsets() { return Object.keys(offsets).length > 0; }

    // card widths come from the framework, once, before anything is measured against them
    var first = currentLayout();
    Object.keys(first.cards).forEach(function (id) {
      var el = cardEl(id);
      if (el) el.style.width = first.cards[id].w + 'px';
    });

    /* ---- draw ---- */
    function draw(L) {
      var R = anyOffsets() ? withOffsets(L, offsets) : L;
      Object.keys(R.cards).forEach(function (id) {
        var el = cardEl(id);
        if (!el) return;
        var c = R.cards[id];
        el.style.left = (c.x + canvas.originX) + 'px';
        el.style.top = (c.y + canvas.originY) + 'px';
      });
      R.pipes.forEach(function (p) {
        var pe = pipeEls[p.id];
        if (!pe) {
          var g = doc.createElementNS(SVG_NS, 'g');
          g.setAttribute('class', 'pipe pipe-' + p.kind);
          g.setAttribute('data-type', p.kind);
          g.setAttribute('data-id', p.id);
          var path = doc.createElementNS(SVG_NS, 'path');
          if (p.kind === 'feedback') path.setAttribute('marker-end', 'url(#mArrowOk)');
          else if (p.kind !== 'control') path.setAttribute('marker-end', 'url(#mArrowMain)');
          g.appendChild(path);
          // dot count is fixed for the life of the page, so dots never pop in or out
          var dots = [];
          for (var i = 0; i < p.dots; i++) {
            var dEl = doc.createElementNS(SVG_NS, 'circle');
            dEl.setAttribute('class', 'particle');
            dEl.setAttribute('r', T.DOT_R);
            g.appendChild(dEl);
            dots.push({
              el: dEl, t: i / p.dots,
              speed: T.DOT_SPEED_BASE * simSpeed * (1 + (Math.random() * 2 - 1) * T.DOT_JITTER)
            });
          }
          pipeLayer.appendChild(g);
          pe = pipeEls[p.id] = { g: g, path: path, dots: dots, len: 0 };
        }
        pe.path.setAttribute('d', pipePath(p));
        pe.len = pe.path.getTotalLength();
      });
    }

    /* ---- modes ---- */
    function setMode(m, delays) {
      if (m === mode && !anim) return;
      var from = {}, to = {};
      Object.keys(cur).forEach(function (id) { from[id] = cur[id]; to[id] = H(heights, id, m); });
      anim = { start: nowMs(), from: from, to: to, delays: delays || {} };
      mode = m;
      rep.settled = false;
      rep.mode = m;
      publish();
    }

    function tick(dt) {
      if (anim) {
        var now = nowMs(), done = true;
        Object.keys(cur).forEach(function (id) {
          var p = (now - anim.start - (anim.delays[id] || 0)) / T.MODE_ANIM_MS;
          if (p < 0) p = 0;
          if (p >= 1) p = 1; else done = false;
          cur[id] = anim.from[id] + (anim.to[id] - anim.from[id]) * ease(p);
        });
        draw(currentLayout());
        if (done) {
          Object.keys(anim.to).forEach(function (id) { cur[id] = anim.to[id]; });
          anim = null;
          draw(currentLayout());
          runInspector();
        }
      }
      Object.keys(pipeEls).forEach(function (id) {
        var pe = pipeEls[id];
        if (!pe.dots.length || !(pe.len >= 1)) return;
        pe.dots.forEach(function (d) {
          d.t = (d.t + d.speed * dt / pe.len) % 1;
          var pt = pe.path.getPointAtLength(d.t * pe.len);
          d.el.setAttribute('cx', pt.x);
          d.el.setAttribute('cy', pt.y);
        });
      });
    }

    /* ---- drag (offsets only, never inspected) ---- */
    var drag = null, suppressClickUntil = 0;

    function loadOffsets() {
      var out = {};
      try {
        var raw = win.sessionStorage.getItem(storeKey);
        if (raw) {
          var o2 = JSON.parse(raw);
          Object.keys(o2).forEach(function (id) {
            if (!heights[id]) return;
            var v = o2[id];
            if (v && isFinite(v.dx) && isFinite(v.dy)) out[id] = { dx: v.dx, dy: v.dy };
          });
        }
      } catch (err) { /* private mode or a full quota must never break the layout */ }
      return out;
    }
    function saveOffsets() {
      try {
        if (anyOffsets()) win.sessionStorage.setItem(storeKey, JSON.stringify(offsets));
        else win.sessionStorage.removeItem(storeKey);
      } catch (err) { /* same */ }
    }
    function updateResetButton() { if (resetButton) resetButton.hidden = !anyOffsets(); }

    Object.keys(heights).forEach(function (id) {
      var el = cardEl(id);
      if (!el) return;
      el.addEventListener('pointerdown', function (e) {
        if (drag) return;
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        var off = offsets[id];
        // no preventDefault here: a press that never moves must still be a plain click
        drag = { id: id, el: el, pointerId: e.pointerId, sx: e.clientX, sy: e.clientY,
                 ox: off ? off.dx : 0, oy: off ? off.dy : 0, moved: false };
      });
    });

    win.addEventListener('pointermove', function (e) {
      if (!drag || e.pointerId !== drag.pointerId) return;
      var dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
      if (!drag.moved) {
        if (Math.hypot(dx, dy) < T.DRAG_THRESHOLD_PX) return;
        drag.moved = true;
        try { drag.el.setPointerCapture(drag.pointerId); } catch (err) { /* not every pointerId is capturable */ }
        drag.el.classList.add('wf-dragging');
        if (onDragStart) onDragStart();
      }
      var z = getZoom() || 1;
      offsets[drag.id] = { dx: drag.ox + dx / z, dy: drag.oy + dy / z };
      draw(currentLayout());
      e.preventDefault();
    });

    function endDrag(e) {
      if (!drag || e.pointerId !== drag.pointerId) return;
      if (drag.moved) {
        drag.el.classList.remove('wf-dragging');
        suppressClickUntil = nowMs() + 350;
        saveOffsets();
        updateResetButton();
        rep.dragged = Object.keys(offsets);
        publish();
      }
      drag = null;
    }
    win.addEventListener('pointerup', endDrag);
    win.addEventListener('pointercancel', endDrag);

    // capture phase on the ancestor, so it runs before a card's own click listener
    canvasInner.addEventListener('click', function (e) {
      if (nowMs() >= suppressClickUntil) return;
      var t = e.target;
      if (t && t.closest && t.closest('.node')) {
        e.stopPropagation();
        e.preventDefault();
        suppressClickUntil = 0;
      }
    }, true);

    if (resetButton) {
      resetButton.addEventListener('click', function () {
        offsets = {};
        saveOffsets();
        draw(currentLayout());
        resetButton.hidden = true;
        rep.dragged = [];
        publish();
      });
    }
    updateResetButton();

    /* ---- inspector ---- */
    function runInspector() {
      var exact = layout(spec, heights, mode, { shifts: canvas.shifts });
      var v = inspect(exact, canvas);
      Object.keys(exact.cards).forEach(function (id) {
        if (offsets[id]) return;                 // never judge a position the user chose
        var el = cardEl(id);
        if (!el) return;
        var c = exact.cards[id];
        var wantX = c.x + canvas.originX, wantY = c.y + canvas.originY, wantH = H(heights, id, mode);
        if (Math.abs(el.offsetLeft - wantX) > 2 || Math.abs(el.offsetTop - wantY) > 2) {
          v.push({ code: 'V7_DOM_DRIFT', a: id, detail: 'dom ' + Math.round(el.offsetLeft) + ',' + Math.round(el.offsetTop) + ' vs layout ' + Math.round(wantX) + ',' + Math.round(wantY) });
        }
        if (Math.abs(el.offsetHeight - wantH) > 2) {
          v.push({ code: 'V7_DOM_DRIFT', a: id, detail: 'dom height ' + el.offsetHeight + ' vs layout ' + wantH });
        }
      });
      v.forEach(function (x) { win.console.warn('[wf-inspector]', x.code, x.a, x.b || '', x.detail || ''); });

      var cards = {};
      Object.keys(exact.cards).forEach(function (id) {
        var c = exact.cards[id];
        cards[id] = { x: c.x, y: c.y, w: c.w, h: c.h };
      });
      rep.mode = mode;
      rep.ok = v.length === 0;
      rep.violations = v;
      rep.cards = cards;
      rep.pipes = exact.pipes.map(function (p) {
        var pe = pipeEls[p.id], smin = 0, smax = 0;
        if (pe && pe.dots.length) {
          smin = Infinity; smax = -Infinity;
          pe.dots.forEach(function (d) { smin = Math.min(smin, d.speed); smax = Math.max(smax, d.speed); });
        }
        return { id: p.id, kind: p.kind, from: p.from, to: p.to, len: p.len, dots: p.dots, speedMin: smin, speedMax: smax };
      });
      rep.dragged = Object.keys(offsets);
      rep.settled = true;
      publish();
    }

    draw(currentLayout());
    runInspector();

    return {
      canvas: canvas,
      setMode: setMode,
      tick: tick,
      report: function () { return rep; }
    };
  }

  return {
    VERSION: VERSION, TOKENS: TOKENS,
    layout: layout, canvasFor: canvasFor, inspect: inspect, withOffsets: withOffsets,
    pipePath: pipePath, samplePipe: samplePipe, pipeLength: pipeLength,
    dotCount: dotCount, carriesDots: carriesDots, cardGap: cardGap,
    mount: mount
  };
});
