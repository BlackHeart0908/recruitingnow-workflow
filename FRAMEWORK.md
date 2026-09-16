# Workflow Library Framework v2

**Version:** 2.0.0 (designed and validated 2026-09-17)
**Code:** `public/framework/wf-framework-v2.js` (layout core + DOM runtime, one file, no dependencies)
**Tests:** `tests/framework_unit.js` (Node) + the "Framework v2" tests in `tests/library_acceptance.spec.js` (browser)
**Replaces:** Measurement Framework v1 (radial angles, shipped in Prompt B-Fix-2). v1 is retired.

---

## 0. Why this exists (read this first)

Think of LEGO. Every brick has studs at exactly the same spacing, so any two bricks always fit together. You still decide what to build: a car, a house, a castle.

- **The framework is the studs.** It owns every small geometry decision: card sizes, gaps, pipe shapes, where pipes attach, dot speed and count, what happens when Full Detail opens, dragging, and an inspector that refuses overlaps.
- **The design is what you build.** For a new workflow you only choose a pattern, list the cards in order, and write the content.

So a new workflow costs design time and copy time, never spacing time. Nobody tunes a gap by eye again.

### How to build a new workflow with the framework (the whole job)

1. Pick a pattern: **Line** or **Brain** (section 3). If neither fits, stop and book a design pass.
2. Write a `WF_SPEC` object: which cards, in which order, which forks, which loops.
3. Write the card content (`NODES`: title, subtitle, counters, tooltip, sub-steps).
4. Call `WF.mount(...)` (section 10). Run the tests. The inspector must report zero violations in both modes.

---

## 1. The reference look (the gold standard)

The **Account Enrichment workflow** (`public/workflows/account-enrichment.html`) is the look every workflow matches. It was hand-tuned and approved. Framework v2 took its measurements directly:

| What | Account Enrichment value | Framework v2 token |
|---|---|---|
| Card width (vertical rectangles) | 170 | `CARD_W = 170` |
| Wide card (the Orchestrator, a horizontal rectangle) | 340 | `HUB_W = 340` |
| Gap between cards in the row | 72 | `GAP_CHAIN = 72` |
| Orchestrator to the row | 90 | `GAP_BRANCH = 90` |
| Freshness loop dip below the lowest card | 45 | `GAP_LOOP = 45` |
| Canvas padding | 56 | `CANVAS_PAD = 56` |
| Dots per 72-unit pipe | 4 | `DOT_SPACING = 18` |
| Dot radius | 3.2 | `DOT_R = 3.2` |
| Dot speed on its pipes (about 12 units per second) | 0.09 to 0.15 of the pipe per second x `SIM_SPEED` 1.4 | `DOT_SPEED_BASE = 8.64`, x `SIM_SPEED` 1.4 = 12.1 |
| Curves on connecting pipes | cubic S-curves | same curve family |

The Account Enrichment page is NOT migrated onto the framework yet (it works and is approved). Its one known flaw, the Human Review card sitting a little far below the row, comes from reserving Full Detail height in Overview. The framework's Line pattern fixes that (section 6) for any future line workflow.

---

## 2. Tokens (the only numbers)

All geometry is in **canvas units** (1 unit = 1 CSS pixel at 100% zoom).

| Token | Value | Meaning |
|---|---|---|
| `CARD_W` | 170 | Width of every normal card |
| `HUB_W` | 340 | Width of a hub (Brain) or a satellite (Line) |
| `GAP_CHAIN` | 72 | Card to next card, lane to lane. The base rhythm. |
| `GAP_BRANCH` | 90 | Hub to first card; fork card to its lane column; satellite above to the row |
| `GAP_LOOP` | 45 | How far a feedback loop runs beyond the cards it passes |
| `GAP_SECTOR` | 120 | Minimum clearance between two different branches |
| `PORT_OFFSET` | 40 | Where a sideways pipe attaches: 40 units below a card's top (or above its bottom, for upper lanes) |
| `CANVAS_PAD` | 56 | Empty margin around the content |
| `DOT_SPACING` | 18 | One dot per 18 units of pipe |
| `DOT_MIN` / `DOT_MAX` | 2 / 10 | Dot count limits per pipe |
| `DOT_SPEED_BASE` | 8.64 | Units per second, multiplied by the page's `SIM_SPEED` (default 1.4) |
| `DOT_JITTER` | 0.25 | Each dot's speed is randomised within plus or minus 25% |
| `DOT_R` | 3.2 | Dot radius |
| `SIM_SPEED_DEFAULT` | 1.4 | The one allowed per-workflow dial (pace of dots and counters) |
| `MODE_ANIM_MS` | 450 | Overview / Full Detail slide duration, easing `cubic-bezier(.4,0,.2,1)` |
| `DRAG_THRESHOLD_PX` | 4 | Screen pixels a pointer must move before a press becomes a drag |

**Rules:**
- Tokens are frozen in code. A workflow never overrides a gap. The only per-workflow dial is `SIM_SPEED`.
- Changing a token is a framework change: bump the version, re-run every test, update this document.
- Heights are never tokens. Card height comes from the real rendered card, measured in both modes.

---

## 3. Building blocks and patterns

### Building blocks

| Block | What it is | Example |
|---|---|---|
| **Card** | A 170-wide box with title, subtitle, counters, sub-steps | Prospector |
| **Hub** | A 340-wide box everything grows out of | Leadgenpro trunk |
| **Chain** | Cards in a straight line, `GAP_CHAIN` apart | Prospector, Lead Database, CRM |
| **Fork** | A chain card that opens one or more lanes | CRM |
| **Lane** | A parallel chain that starts from a fork | Cold Call, Call Analyzer, AI Coach |
| **Loop** | A dashed feedback line back to an earlier card, no dots | AI Coach back to CRM |
| **Satellite** | A card attached above or below a Line row | Orchestrator above, Human Review below |

### Pattern: Brain (LeadGenPro)

A hub in the middle. Up to 4 branches leave it: `right`, `down`, `left`, `up`. Each branch is a chain. A chain card can fork into lanes.

```
                                          ╭─ [WhatsApp]
[Trunk]──[Prospector]──[Database]──[CRM]──┤
                                          ╰─ [Cold Call]──[Analyzer]──[Coach]
                                     CRM ◄─ ─ ─ ─ ─ feedback loop ─ ─ ─ ─ ─ ─╯
```

### Pattern: Line (Account Enrichment style)

A single horizontal row, optionally one satellite above (connected to every card) and satellites below (under a chosen card).

```
                 [      Orchestrator      ]
                   │    │    │    │    │
[Card]──[Card]──[Card]──[Card]──[Card]──[Card]
                          │
                    [Human Review]
```

---

## 4. The spec object (`WF_SPEC`)

### Brain

```js
var WF_SPEC = {
  pattern: 'brain',
  hub: 'trunk',
  branches: [
    { id: 'A', dir: 'right', chain: ['prospector', 'database', 'crm'],
      forks: [{ at: 'crm', lanes: [
        { side: -1, chain: ['whatsapp'] },
        { side:  1, chain: ['coldcall', 'analyzer', 'coach'] }
      ] }] },
    { id: 'B', dir: 'down',  chain: ['stubB'] },
    { id: 'C', dir: 'left',  chain: ['stubC'] },
    { id: 'D', dir: 'up',    chain: ['stubD'] }
  ],
  loops: [{ from: 'coach', to: 'crm' }]
};
```

- `dir`: `right`, `down`, `left`, `up`. Branch order in the array matters only for spacing priority (later branches move outward if they crowd earlier ones).
- `side`: on `right`/`left` branches `-1` = above, `+1` = below. On `down`/`up` branches `-1` = left, `+1` = right.
- Several lanes may sit on the same side. They stack outward in array order.
- Pipe kinds are assigned automatically: hub to first card `trunk-branch`, along a chain `main`, fork to lane `sub`, along a lane `linear`, loop `feedback`.

### Line

```js
var WF_SPEC = {
  pattern: 'line',
  chain: ['n1', 'n2', 'n3', 'n4', 'n5', 'n6', 'n7'],
  above: { id: 'orchestrator', connect: 'each' },          // width defaults to HUB_W; optional over: 'n4'
  below: [{ id: 'review', under: 'n4', width: 190 }],      // width defaults to CARD_W
  edges: [{ from: 'n4', to: 'review' }]                    // extra pipes, kind 'branch'
};
```

### What is allowed and what needs a design pass

| Allowed (framework handles it) | Needs a design pass (the code throws an error) |
|---|---|
| Up to 4 branches in any of the 4 directions | A 5th branch or a diagonal branch |
| Any number of forks on a branch's main chain | A fork inside a lane (lanes cannot fork) |
| Any number of lanes, either side, stacked | A loop that starts on an inner lane |
| Loops on `right`/`left` branches from the OUTERMOST lane back to a main card at or before the fork | Loops on `up`/`down` branches |
| One satellite above and any satellites below (Line) | Branches that cannot be cleared from each other |

The errors are deliberate. They stop a sloppy layout from ever rendering.

---

## 5. Placement rules: Brain

The hub centre is the origin (0, 0). y grows downward.

**Hub:** width `HUB_W`, measured height, centred on the origin.

**Right branch, main chain:**
- First card left edge = `HUB_W / 2 + GAP_BRANCH`.
- Every next card left edge = previous right edge + `GAP_CHAIN`.
- Every card top = `-PORT_OFFSET`. This puts every sideways pipe port exactly on the hub's centre line, so hub-to-chain and chain pipes are perfectly straight.

**Left branch:** a mirror image of the right branch.

**Down branch, main chain:**
- Cards centred on x = 0.
- First card top = hub bottom + `GAP_BRANCH`.
- Every next card top = previous card bottom + `GAP_CHAIN` (uses the card's current height, so the chain lengthens smoothly in Full Detail).

**Up branch:** a mirror image of the down branch.

**Lanes on a right/left branch (a fork at card F):**
- Lane column starts `GAP_BRANCH` beyond F if the main chain ends at F, or `GAP_CHAIN` beyond F if the main chain continues (then lanes share the continuation's columns).
- Cards along a lane are `GAP_CHAIN` apart.
- **No continuation:** the first lane on each side sits `GAP_CHAIN / 2` from the centre line, so an upper lane and a lower lane are exactly `GAP_CHAIN` apart.
- **With continuation:** the first lane sits `GAP_CHAIN` beyond the continuation cards' top or bottom.
- Further lanes on the same side sit `GAP_CHAIN` beyond the previous lane.
- **Lower lanes (`+1`)** are top-aligned. They grow downward in Full Detail. Their port is 40 below the top.
- **Upper lanes (`-1`)** are bottom-aligned. They grow upward in Full Detail and their port is 40 above the bottom. Result: the two fork pipes are mirror images and never move when Full Detail opens.

**Lanes on a down/up branch:** the same idea turned 90 degrees. Lanes run in columns left (`-1`) or right (`+1`) of the main column. A lane beside a continuing chain sits `GAP_CHAIN` outside the main column. A lane after the last card sits `GAP_CHAIN / 2` from the centre line. The decision uses the chain's structure, never card heights, so lanes never jump sideways during an animation.

**Branches crowding each other:** after placing all branches, each branch's rectangle envelope is checked against every earlier branch. This is checked in Overview, in Full Detail, and across mixed modes (so staggered animation frames are covered too). If two envelopes are closer than `GAP_SECTOR`, the later branch moves straight outward along its own direction by exactly the missing distance. The move is computed once and used in both modes, so branches never jump when the mode changes. For LeadGenPro today, no branch moves.

---

## 6. Placement rules: Line

- Row card `i` left edge = `i x (CARD_W + GAP_CHAIN)`, every card top = 0 (top-aligned, like Account Enrichment).
- **Satellite above:** width `HUB_W` (or its own `width`), centred over the row (or over the card named in `over`). Bottom sits `GAP_BRANCH` above the row top. With `connect: 'each'`, one control pipe runs from evenly spaced ports along its bottom edge to the top centre of every row card.
- **Satellite below:** centred under the card named in `under`. Its top = the lowest current bottom of every row card within `GAP_CHAIN` of its width, + `GAP_CHAIN`. "Current" means Overview height in Overview and Full Detail height in Full Detail, so it never floats far away (the Account Enrichment Human Review fix).

---

## 7. Pipes

- **Ports:**
  - A sideways flow (right/left branches, Line row) attaches on the facing side, `PORT_OFFSET` below the card top (upper lanes: above the bottom).
  - An up/down flow attaches at the bottom centre and top centre.
  - The hub attaches at its side centres.
- **Curves:** one cubic S-curve per pipe. The handle length is half the distance along the flow direction (minimum 24), and the curve always starts and ends parallel to the flow. The flow direction comes from the branch, never from comparing dx and dy (the v1 bug source).
- **Loops are orthogonal, like a metro line:** straight out of the lane card, a 24-unit rounded corner, straight across `GAP_LOOP` beyond every card of the branch in that span, a corner, then straight into the target card. Upper lanes loop above, lower lanes loop below. Clearance is guaranteed by construction.
- **Classes and markers:** every pipe is `<g class="pipe pipe-KIND" data-type="KIND" data-id="FROM__TO">` with one `<path>`. Arrowheads: `url(#mArrowMain)` on every kind except `feedback` (`url(#mArrowOk)`) and `control` (none).
- **Coordinates:** all pipes live inside one `<g id="wfPipes" transform="translate(originX,originY)">`, so pipe maths stays in origin-centred units.

---

## 8. Dots (data flowing)

- Dots run on every pipe except `feedback` and `control`.
- **Count** = `round(length / 18)`, clamped to 2..10. It is fixed when the page loads (Overview length), so dots never pop in or out.
- **Speed** is in canvas units per second: `DOT_SPEED_BASE x SIM_SPEED x (1 +/- random 25%)`, about 12 units per second at `SIM_SPEED` 1.4. Every pipe feels the same speed regardless of its length. v1 measured speed as a fraction of the pipe, which made long pipes race and short pipes crawl.
- **Motion:** each frame `t += speed x dt / currentLength`, wrapping at 1. When a pipe changes shape (animation or drag), dots keep their `t`, so they glide instead of teleporting.

---

## 9. Modes, canvas and animation

- **Heights:** measured once after the cards render at their framework width. Overview height = the card as rendered. Full Detail height = card + its sub-step block.
- **Canvas size** = the union of the content bounds in BOTH modes + `CANVAS_PAD`. The size never changes when the mode changes, so zoom never jumps. Fit-to-screen centres the content. (The Brain hub is not forced to the canvas centre: that wasted half the canvas and made cards unreadably small.)
- **Mode switch:** the page opens or closes the sub-step blocks as today, with the same 60 ms stagger per card when opening. The runtime replays that timeline: every frame, each card's height is interpolated from its old height to its target with the same easing and delay, the pure layout runs on those heights, and cards and pipes are placed. So cards slide apart while they grow, pipes follow, and nothing ever overlaps mid-way (validated on 36,000 random staggered frames). When every card finishes, the exact target layout is applied and the inspector runs.
- Switching mode mid-animation starts from the current in-between heights, so there is no jump.

---

## 10. Dragging cards

- Press a card and move more than 4 screen pixels: the card follows the pointer. A shorter press is a normal click (the detail panel opens as before).
- Only positions change. Pipes attached to any moved card redraw every frame and dots follow.
- The dragged position is an **offset** from the framework position. When Full Detail opens, a dragged card still slides with its lane, shifted by your offset.
- **Memory:** offsets live in `sessionStorage` under `wflib.v2.drag.<workflowId>`. They survive a normal refresh (F5) and are cleared when the tab closes. A browser cannot reliably tell a hard refresh from F5, so the reliable reset is the **Reset layout** button. It appears in the top bar only while something is dragged, and puts every card back instantly.
- The inspector judges only the framework layout, never dragged positions. You may drag cards on top of each other on purpose.
- Dragging the empty canvas still pans, and pinch and wheel zoom still work.

---

## 11. The inspector

Runs on the pure layout in both modes (unit tests) and in the browser after load and after every mode switch settles.

| Code | Check |
|---|---|
| `V1_CARD_GAP` | Every pair of cards is at least `GAP_CHAIN` apart, edge to edge |
| `V2_PIPE_THROUGH_CARD` | No pipe passes through a card it does not connect |
| `V3_SECTOR` | Branch envelopes at least `GAP_SECTOR` apart |
| `V4_SHORT_PIPE` | Every dot-carrying pipe at least 90% of `GAP_CHAIN` long (no flickering stubs) |
| `V5_PORT_OFF_CARD` | A sideways port sits inside its card |
| `V6_OUTSIDE_CANVAS` | Every card inside the canvas |
| `V7_DOM_DRIFT` | Browser only: each undragged card's real position and height match the layout within 2 units |

Every violation prints `console.warn('[wf-inspector]', code, a, b, detail)` and lands in `window.__wfLayoutReport`:

```js
{
  framework: '2.0.0', workflow: 'leadgenpro', mode: 'overview', settled: true, ok: true,
  violations: [],
  simSpeed: 1.4,
  canvas: { w, h, originX, originY },
  cards: { id: { x, y, w, h } },            // framework layout, origin-centred units
  pipes: [ { id, kind, from, to, len, dots, speedMin, speedMax } ],
  dragged: [ 'database' ]
}
```

Tests read this report. A build is not done while `ok` is false in either mode.

---

## 12. Runtime API

```js
WF.VERSION                        // '2.0.0'
WF.TOKENS                         // frozen
WF.layout(spec, heights, mode, { shifts })   // pure: { cards, pipes, envelopes, flow, loops }
WF.canvasFor(spec, heights)                  // pure: { w, h, originX, originY, shifts }
WF.inspect(layout, canvas)                   // pure: violations[]
WF.withOffsets(layout, offsets)              // pure: layout with dragged cards and rebuilt pipes
WF.pipePath(pipe), WF.samplePipe(pipe, n), WF.pipeLength(pipe), WF.dotCount(len)

var rt = WF.mount({
  workflowId: 'leadgenpro',
  spec: WF_SPEC,
  canvasInner: document.getElementById('canvasInner'),
  svg: document.getElementById('pipesSvg'),
  cardEl: function (id) { return document.getElementById('node-' + id); },
  heights: { id: { overview: 182, detail: 430 } },  // measured by the page before mount
  getZoom: function () { return zoom; },
  simSpeed: SIM_SPEED,
  resetButton: document.getElementById('wfResetLayout'),
  onDragStart: function () { hideTooltip(); }
});
rt.canvas                         // { w, h, originX, originY, shifts }
rt.setMode('detail', { crm: 120 })  // mode + per-card open delays in ms
rt.tick(dt)                       // call once per animation frame from the page loop (seconds)
rt.report()                       // the current __wfLayoutReport
```

Card width is `WF.TOKENS.HUB_W` for the hub or satellite `above`, the satellite's own `width` if given, else `WF.TOKENS.CARD_W`. The page sets the width before measuring heights, because height depends on width.

---

## 13. Versioning and caching

- The page loads `../framework/wf-framework-v2.js?v=2.0.0`. A bug-fix release bumps the query string (2.0.1) so browsers fetch the new file.
- A change that would move any existing card is a breaking change: create `wf-framework-v3.js`, keep v2 in place for pages not yet moved, and add a migration prompt.
- The file must stay free of client names (it is publicly served).

---

## 14. Known limits (accepted on purpose)

- Loops only on left/right branches, and only from the outermost lane. Anything else throws and needs a design pass.
- Lanes cannot fork.
- If branches ever crowd each other, the later branch is pushed outward. That is correct but can look far. Treat any push as a signal the design needs a look.
- Dragged cards may overlap in Full Detail. That is user-caused and not inspected.
- The Account Enrichment page still runs its own hand-tuned code. Migrating it onto the Line pattern is a separate, optional prompt.
- The mobile layout of the library shell is still the old known issue and out of scope here.
