'use strict';
const { test, expect } = require('@playwright/test');

const BASE_URL = 'http://127.0.0.1:4173/';

async function waitForFrameLoad(page) {
  const frameHandle = await page.waitForSelector('#frame');
  const frame = await frameHandle.contentFrame();
  await frame.waitForLoadState('load');
  return { frameHandle, frame };
}

/* ---- Framework v2 helpers ---- */

async function waitForSettled(frame, mode) {
  await frame.waitForFunction(function (m) {
    var r = window.__wfLayoutReport; return !!(r && r.settled && r.mode === m);
  }, mode, { timeout: 8000 });
  return frame.evaluate(function () { return window.__wfLayoutReport; });
}

async function canvasRect(frame, id) {
  return frame.evaluate(function (id) {
    var inner = document.getElementById('canvasInner');
    var m = /scale\(([\d.]+)\)/.exec(inner.style.transform); var z = m ? parseFloat(m[1]) : 1;
    var ir = inner.getBoundingClientRect(); var r = document.getElementById('node-' + id).getBoundingClientRect();
    return { x: (r.left - ir.left) / z, y: (r.top - ir.top) / z, w: r.width / z, h: r.height / z, right: (r.right - ir.left) / z, bottom: (r.bottom - ir.top) / z };
  }, id);
}

// every geometry assertion below is "plus or minus 2" against a framework token
function near(actual, expected, tol) {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tol == null ? 2 : tol);
}

async function dragNode(page, frame, id, dx, dy) {
  const box = await frame.locator('#node-' + id).boundingBox();
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + dx, cy + dy, { steps: 8 });
  await page.mouse.up();
  return box;
}

// Finds a point inside the workflow frame that is not over a card or chrome, and from which a
// drag of (dx, dy) still lands inside the viewport, so the page's own pan handler gets it.
async function emptySpot(frame, dx, dy) {
  return frame.evaluate(function (a) {
    var vw = window.innerWidth, vh = window.innerHeight;
    for (var gy = 0.12; gy <= 0.92; gy += 0.04) {
      for (var gx = 0.03; gx <= 0.97; gx += 0.03) {
        var x = Math.round(vw * gx), y = Math.round(vh * gy);
        var tx = x + a.dx, ty = y + a.dy;
        if (tx < 8 || tx > vw - 8 || ty < 56 || ty > vh - 8) continue;
        var el = document.elementFromPoint(x, y);
        if (!el) continue;
        if (el.closest('.node') || el.closest('#topbar') || el.closest('.detail-panel') || el.closest('.tooltip')) continue;
        return { x: x, y: y };
      }
    }
    return null;
  }, { dx: dx, dy: dy });
}

async function panFrame(page, frame, dx, dy) {
  const frameBox = await page.locator('#frame').boundingBox();
  let remX = dx, remY = dy;
  for (let i = 0; i < 10 && (Math.abs(remX) > 2 || Math.abs(remY) > 2); i++) {
    const stepX = Math.max(-380, Math.min(380, remX));
    const stepY = Math.max(-380, Math.min(380, remY));
    const spot = await emptySpot(frame, stepX, stepY);
    if (!spot) return;
    await page.mouse.move(frameBox.x + spot.x, frameBox.y + spot.y);
    await page.mouse.down();
    await page.mouse.move(frameBox.x + spot.x + stepX, frameBox.y + spot.y + stepY, { steps: 10 });
    await page.mouse.up();
    remX -= stepX; remY -= stepY;
  }
}

// The +/- buttons step by a fixed 0.1, so exactly 100% is not reachable from an arbitrary fit
// zoom. The page's ctrl+wheel path is multiplicative, so one wheel event lands on it exactly.
async function zoomTo100(frame) {
  await frame.evaluate(function () {
    var inner = document.getElementById('canvasInner');
    var m = /scale\(([\d.]+)\)/.exec(inner.style.transform);
    var z = m ? parseFloat(m[1]) : 1;
    if (!z || Math.abs(z - 1) < 0.0005) return;
    var vp = document.getElementById('canvasViewport');
    var r = vp.getBoundingClientRect();
    vp.dispatchEvent(new WheelEvent('wheel', {
      deltaY: -Math.log(1 / z) / 0.0015,        // the page applies zoom * exp(-deltaY * 0.0015)
      ctrlKey: true, bubbles: true, cancelable: true,
      clientX: r.left + r.width / 2, clientY: r.top + r.height / 2
    }));
  });
}

async function focusOnNodes(page, frame, ids) {
  await frame.locator('body').press('0');
  await page.waitForTimeout(200);
  await zoomTo100(frame);
  const focus = await frame.evaluate(function (fids) {
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    fids.forEach(function (id) {
      var r = document.getElementById('node-' + id).getBoundingClientRect();
      x0 = Math.min(x0, r.left); y0 = Math.min(y0, r.top); x1 = Math.max(x1, r.right); y1 = Math.max(y1, r.bottom);
    });
    return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, vw: window.innerWidth, vh: window.innerHeight };
  }, ids);
  await panFrame(page, frame, focus.vw / 2 - focus.cx, (focus.vh + 44) / 2 - focus.cy);
  await page.waitForTimeout(300);
}

async function contentGaps(frame) {
  return frame.evaluate(function () {
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    function add(r) { if (!r.width && !r.height) return; x0 = Math.min(x0, r.left); y0 = Math.min(y0, r.top); x1 = Math.max(x1, r.right); y1 = Math.max(y1, r.bottom); }
    document.querySelectorAll('.node').forEach(function (el) { add(el.getBoundingClientRect()); });
    document.querySelectorAll('#wfPipes .pipe').forEach(function (el) { add(el.getBoundingClientRect()); });
    return { left: x0, right: window.innerWidth - x1, top: y0 - 44, bottom: window.innerHeight - y1 };
  });
}

function expectCentred(g) {
  expect(Math.abs(g.left - g.right)).toBeLessThan(12);
  expect(Math.abs(g.top - g.bottom)).toBeLessThan(12);
  expect(Math.min(g.left, g.right, g.top, g.bottom)).toBeGreaterThanOrEqual(8);
  expect(Math.min(g.left, g.top)).toBeLessThanOrEqual(40);   // fitted tight on the limiting axis, not shrunk to the canvas
}

test('Test 1: Homepage default landing', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(BASE_URL);
  const { frameHandle } = await waitForFrameLoad(page);
  const src = await frameHandle.getAttribute('src');
  expect(src.endsWith('workflows/home.html')).toBeTruthy();
  await expect(page.locator('.viewer-empty')).not.toHaveClass(/show/);
  await context.close();
});

test('Test 2: Deep link still wins', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(BASE_URL + '#account-enrichment');
  const { frameHandle } = await waitForFrameLoad(page);
  const src = await frameHandle.getAttribute('src');
  expect(src.endsWith('workflows/account-enrichment.html')).toBeTruthy();
  await context.close();
});

test('Test 3: No blank state on any load path', async ({ browser }) => {
  const paths = ['', '#account-enrichment', '#nonexistent-id'];
  for (const p of paths) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(BASE_URL + p);
    await waitForFrameLoad(page);
    await expect(page.locator('.viewer-empty')).not.toHaveClass(/show/);
    if (p === '#nonexistent-id') {
      const src = await page.locator('#frame').getAttribute('src');
      expect(src.endsWith('workflows/home.html')).toBeTruthy();
    }
    await context.close();
  }
});

test('Test 4: Desktop collapse hides the shell brand', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto(BASE_URL);
  await page.waitForSelector('#workflowList .wf-card');

  const collapsedStored = await page.evaluate(function () {
    return localStorage.getItem('wflib.sidebarCollapsed');
  });
  if (collapsedStored !== '1') {
    await page.click('#sidebarMenuBtn');
  }

  await expect(page.locator('.sidebar')).toHaveClass(/collapsed/);
  await page.waitForTimeout(400); // let the .28s collapse-width transition settle

  const brandTitle = page.locator('.sidebar .brand-title');
  const visible = await brandTitle.isVisible();
  const box = await brandTitle.boundingBox();
  const notVisible = !visible || !box || box.width === 0;
  expect(notVisible).toBeTruthy();

  await context.close();
});

test('Test 5: Mobile keeps the topbar', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const page = await context.newPage();
  await page.goto(BASE_URL);
  await page.waitForSelector('#workflowList .wf-card');

  await expect(page.locator('.topbar')).toBeVisible();
  await expect(page.locator('.topbar .brand-title')).toBeVisible();
  await expect(page.locator('.topbar .count-badge')).toBeVisible();
  await context.close();
});

test('Test 6: Workflow horizontally centered', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(BASE_URL + '#account-enrichment');
  const { frame } = await waitForFrameLoad(page);
  await page.waitForTimeout(1500); // let layout settle

  const edges = await frame.evaluate(function () {
    var el = document.getElementById('canvasInner');
    var r = el.getBoundingClientRect();
    return { left: r.left, right: window.innerWidth - r.right };
  });
  expect(Math.abs(edges.left - edges.right)).toBeLessThan(12);
  await context.close();
});

test('Test 7: Cross-frame menu toggle from workflow', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto(BASE_URL + '#account-enrichment');
  await waitForFrameLoad(page);

  const initialCollapsed = await page.locator('.sidebar').evaluate(function (el) {
    return el.classList.contains('collapsed');
  });

  await page.frameLocator('#frame').locator('#wfMenuBtn').click();
  await page.waitForTimeout(400);

  const afterCollapsed = await page.locator('.sidebar').evaluate(function (el) {
    return el.classList.contains('collapsed');
  });
  expect(afterCollapsed).toBe(!initialCollapsed);
  await context.close();
});

test('Test 8: Cross-frame menu toggle from homepage', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto(BASE_URL);
  await waitForFrameLoad(page);

  const initialCollapsed = await page.locator('.sidebar').evaluate(function (el) {
    return el.classList.contains('collapsed');
  });

  await page.frameLocator('#frame').locator('#wfMenuBtn').click();
  await page.waitForTimeout(400);

  const afterCollapsed = await page.locator('.sidebar').evaluate(function (el) {
    return el.classList.contains('collapsed');
  });
  expect(afterCollapsed).toBe(!initialCollapsed);
  await context.close();
});

test('Test 9: Zero console errors after fixes', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();

  const pageErrors = [];
  const consoleErrors = [];
  // Page-level listeners in Playwright capture events from every frame of
  // the page (main frame and same-origin iframes alike) -- there is no
  // separate per-frame pageerror/console API -- so this single pair of
  // listeners is what covers "both the parent page and the iframe frame".
  page.on('pageerror', function (err) { pageErrors.push(String(err)); });
  page.on('console', function (msg) {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  await page.goto(BASE_URL + '#account-enrichment');
  await waitForFrameLoad(page);
  await page.waitForTimeout(1500);

  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
  await context.close();
});

test('Test 10: Sanity that the workflow renders', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(BASE_URL + '#account-enrichment');
  const { frame } = await waitForFrameLoad(page);

  const nodeCount = await frame.locator('.node').count();
  expect(nodeCount).toBeGreaterThan(0);
  await expect(frame.locator('.node').first()).toBeVisible();
  await context.close();
});

test('Test 11: LeadGenPro card visible in sidebar', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(BASE_URL);
  await page.waitForSelector('#workflowList .wf-card');

  const card = page.locator('[data-id="leadgenpro"]');
  await expect(card).toBeVisible();
  await expect(card.locator('.wf-title')).toHaveText('Leadgenpro');
  await context.close();
});

test('Test 12: LeadGenPro deep link', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(BASE_URL + '#leadgenpro');
  const { frameHandle } = await waitForFrameLoad(page);
  const src = await frameHandle.getAttribute('src');
  expect(src.endsWith('workflows/leadgenpro.html')).toBeTruthy();
  await context.close();
});

/* Test 13b: the fit centres the CURRENT mode's content in both axes (Prompt B). */
test('Test 13b: LeadGenPro content centred in both axes, both modes', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await context.newPage();
  await page.goto(BASE_URL + '#leadgenpro');
  const { frame } = await waitForFrameLoad(page);

  await waitForSettled(frame, 'overview');
  await page.waitForTimeout(300);
  expectCentred(await contentGaps(frame));

  await frame.locator('#btnMinor').click();
  await waitForSettled(frame, 'detail');
  await page.waitForTimeout(600);
  expectCentred(await contentGaps(frame));

  await frame.locator('#btnMajor').click();
  await waitForSettled(frame, 'overview');
  await page.waitForTimeout(600);
  expectCentred(await contentGaps(frame));

  const scaleBefore = await frame.evaluate(function () {
    var m = /scale\(([\d.]+)\)/.exec(document.getElementById('canvasInner').style.transform);
    return m ? parseFloat(m[1]) : 1;
  });
  await panFrame(page, frame, 150, 0);
  await frame.locator('#btnMinor').click();
  await waitForSettled(frame, 'detail');
  await page.waitForTimeout(600);
  const scaleAfter = await frame.evaluate(function () {
    var m = /scale\(([\d.]+)\)/.exec(document.getElementById('canvasInner').style.transform);
    return m ? parseFloat(m[1]) : 1;
  });
  expect(Math.abs(scaleAfter - scaleBefore)).toBeLessThan(0.001);

  await frame.locator('body').press('0');
  await page.waitForTimeout(300);
  expectCentred(await contentGaps(frame));

  await context.close();
});

test('Test 14: Branch A has exactly 7 detailed nodes', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(BASE_URL + '#leadgenpro');
  const { frame } = await waitForFrameLoad(page);
  await page.waitForTimeout(500);

  const count = await frame.locator('.node[data-branch="A"]').count();
  expect(count).toBe(7);
  await context.close();
});

test('Test 14c: Branch C has exactly 10 detailed nodes', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(BASE_URL + '#leadgenpro');
  const { frame } = await waitForFrameLoad(page);
  await page.waitForTimeout(500);

  const count = await frame.locator('.node[data-branch="C"]').count();
  expect(count).toBe(10);
  await context.close();
});

test('Test 14b: Branch B has exactly 10 detailed nodes', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(BASE_URL + '#leadgenpro');
  const { frame } = await waitForFrameLoad(page);
  await page.waitForTimeout(500);

  const count = await frame.locator('.node[data-branch="B"]').count();
  expect(count).toBe(10);
  await context.close();
});

// Prompt B: Branch B live, every LeadGenPro branch is built out
test('Test 15: no stubs remain', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(BASE_URL + '#leadgenpro');
  const { frame } = await waitForFrameLoad(page);
  await page.waitForTimeout(500);

  const count = await frame.locator('.node.stub').count();
  expect(count).toBe(0);
  await context.close();
});

test('Test 16: Cold Call human-in-loop badge', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(BASE_URL + '#leadgenpro');
  const { frame } = await waitForFrameLoad(page);
  await page.waitForTimeout(500);

  await expect(frame.locator('#node-coldcall .human-in-loop-badge')).toHaveCount(1);
  await context.close();
});

test('Test 16b: Approval & Send (piqSend) carries the human badge and Auto-send switch', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(BASE_URL + '#leadgenpro');
  const { frame } = await waitForFrameLoad(page);
  await page.waitForTimeout(500);

  await expect(frame.locator('#node-piqSend .human-in-loop-badge')).toHaveCount(1);
  await expect(frame.locator('#node-piqSend .auto-toggle')).toHaveCount(1);
  await context.close();
});

test('Test 16c: Approval & Send cards carry the human badge and Auto-send switch', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(BASE_URL + '#leadgenpro');
  const { frame } = await waitForFrameLoad(page);
  await page.waitForTimeout(500);

  await expect(frame.locator('#node-projSend .human-in-loop-badge')).toHaveCount(1);
  await expect(frame.locator('#node-recSend .human-in-loop-badge')).toHaveCount(1);
  await expect(frame.locator('#node-projSend .auto-toggle')).toHaveCount(1);
  await expect(frame.locator('#node-recSend .auto-toggle')).toHaveCount(1);
  await context.close();
});

test('Test 16e: Auto-send toggle works', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await context.newPage();
  await page.goto(BASE_URL + '#leadgenpro');
  const { frame } = await waitForFrameLoad(page);
  await waitForSettled(frame, 'overview');

  const ids = ['piqSend', 'projSend', 'recSend'];
  for (const id of ids) {
    await focusOnNodes(page, frame, [id]);
    const recorded = await canvasRect(frame, id);

    const toggle = frame.locator('#node-' + id + ' .auto-toggle');
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await expect(toggle).toContainText('Auto-send: off');

    await toggle.click({ force: true });
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await expect(toggle).toHaveClass(/on/);
    await expect(toggle).toContainText('Auto-send: on');
    await expect(frame.locator('#node-' + id)).toHaveClass(/auto-on/);
    await expect(frame.locator('#detailPanel')).not.toHaveClass(/open/);
    const draggedAfterClick = await frame.evaluate(function () { return window.__wfLayoutReport.dragged; });
    expect(draggedAfterClick.length).toBe(0);
    const rectAfterClick = await canvasRect(frame, id);
    near(rectAfterClick.x, recorded.x, 1);
    near(rectAfterClick.y, recorded.y, 1);

    await page.waitForTimeout(400);
    const opacityOn = await frame.locator('#node-' + id + ' .human-in-loop-badge').evaluate(function (el) {
      return parseFloat(getComputedStyle(el).opacity);
    });
    expect(opacityOn).toBeLessThan(0.05);

    await toggle.focus();
    await page.keyboard.press('Space');
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await page.waitForTimeout(400);
    const opacityOff = await frame.locator('#node-' + id + ' .human-in-loop-badge').evaluate(function (el) {
      return parseFloat(getComputedStyle(el).opacity);
    });
    expect(opacityOff).toBeGreaterThan(0.95);

    const toggleBox = await toggle.boundingBox();
    await page.mouse.move(toggleBox.x + toggleBox.width / 2, toggleBox.y + toggleBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(toggleBox.x + toggleBox.width / 2 + 60, toggleBox.y + toggleBox.height / 2, { steps: 10 });
    await page.mouse.up();
    const rectAfterDrag = await canvasRect(frame, id);
    near(rectAfterDrag.x, recorded.x, 1);
    near(rectAfterDrag.y, recorded.y, 1);
    const draggedAfterDrag = await frame.evaluate(function () { return window.__wfLayoutReport.dragged; });
    expect(draggedAfterDrag.length).toBe(0);

    if (id === 'piqSend') {
      await toggle.click({ force: true });
      await expect(toggle).toHaveAttribute('aria-checked', 'true');
      await expect(frame.locator('#node-projSend .auto-toggle')).toHaveAttribute('aria-checked', 'false');
      await toggle.click({ force: true });
      await expect(toggle).toHaveAttribute('aria-checked', 'false');
    }
  }
  await context.close();
});

test('Test 17: AI Coach feedback edge exists', async ({ browser }) => {
  // Prompt C: Branch C live, Branch D retired -- adds a second feedback loop (pattern -> radarOrch).
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(BASE_URL + '#leadgenpro');
  const { frame } = await waitForFrameLoad(page);
  await page.waitForTimeout(500);

  const count = await frame.locator('.pipe[data-type="feedback"]').count();
  expect(count).toBeGreaterThanOrEqual(2);
  await expect(frame.locator('.pipe[data-id="pattern__radarOrch"]')).toHaveCount(1);
  await context.close();
});

test('Test 18: wf-menu-btn toggles sidebar from LeadGenPro', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto(BASE_URL + '#leadgenpro');
  await waitForFrameLoad(page);

  const initialCollapsed = await page.locator('.sidebar').evaluate(function (el) {
    return el.classList.contains('collapsed');
  });

  await page.frameLocator('#frame').locator('#wfMenuBtn').click();
  await page.waitForTimeout(400);

  const afterCollapsed = await page.locator('.sidebar').evaluate(function (el) {
    return el.classList.contains('collapsed');
  });
  expect(afterCollapsed).toBe(!initialCollapsed);
  await context.close();
});

test('Test 19: Zero console errors on LeadGenPro load', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();

  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', function (err) { pageErrors.push(String(err)); });
  page.on('console', function (msg) {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  await page.goto(BASE_URL + '#leadgenpro');
  await waitForFrameLoad(page);
  await page.waitForTimeout(1500);

  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
  await context.close();
});

test('Test 20: Full Detail toggle reveals sub-steps', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(BASE_URL + '#leadgenpro');
  const { frame } = await waitForFrameLoad(page);
  await page.waitForTimeout(500);

  await frame.locator('#btnMinor').click();
  await page.waitForTimeout(400); // layout settle

  const branchANodes = frame.locator('.node[data-branch="A"]');
  const count = await branchANodes.count();
  let found = false;
  for (let i = 0; i < count; i++) {
    const li = branchANodes.nth(i).locator('.minor-steps li');
    const liCount = await li.count();
    if (liCount >= 3) { found = true; break; }
  }
  expect(found).toBeTruthy();
  await context.close();
});

test('Test 20c: built vs in-development marking', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(BASE_URL + '#leadgenpro');
  const { frame } = await waitForFrameLoad(page);
  await waitForSettled(frame, 'overview');

  await frame.locator('#btnMinor').click();
  await waitForSettled(frame, 'detail');

  const branchCNodes = frame.locator('.node[data-branch="C"]');
  const cCount = await branchCNodes.count();
  for (let i = 0; i < cCount; i++) {
    const liCount = await branchCNodes.nth(i).locator('.minor-steps li').count();
    expect(liCount).toBeGreaterThanOrEqual(4);
  }

  await expect(frame.locator('.node[data-branch="A"] .minor-steps li.dev')).toHaveCount(0);

  const devCount = await frame.locator('.node[data-branch="C"] .minor-steps li.dev').count();
  const builtCount = await frame.locator('.node[data-branch="C"] .minor-steps li:not(.dev)').count();
  expect(devCount).toBeGreaterThan(0);
  expect(builtCount).toBeGreaterThan(0);

  const planned = frame.locator('.node.planned');
  await expect(planned).toHaveCount(2);
  const plannedIds = await planned.evaluateAll(function (els) { return els.map(function (el) { return el.id; }).sort(); });
  expect(plannedIds).toEqual(['node-contact', 'node-piqApollo']);
  for (let i = 0; i < 2; i++) {
    const p = planned.nth(i);
    await expect(p).toContainText('IN DEVELOPMENT');
    const plannedOpacity = await p.evaluate(function (el) {
      return parseFloat(getComputedStyle(el).opacity);
    });
    expect(plannedOpacity).toBeGreaterThanOrEqual(0.55);
    expect(plannedOpacity).toBeLessThanOrEqual(0.65);
  }

  await expect(frame.locator('.node.planned.stub')).toHaveCount(0);
  await expect(frame.locator('#statusLegend')).toBeVisible();

  const branchBNodes = frame.locator('.node[data-branch="B"]');
  const bCount = await branchBNodes.count();
  for (let i = 0; i < bCount; i++) {
    const liCount = await branchBNodes.nth(i).locator('.minor-steps li').count();
    expect(liCount).toBeGreaterThanOrEqual(4);
  }
  const bDevCount = await frame.locator('.node[data-branch="B"] .minor-steps li.dev').count();
  const bBuiltCount = await frame.locator('.node[data-branch="B"] .minor-steps li:not(.dev)').count();
  expect(bDevCount).toBeGreaterThan(0);
  expect(bBuiltCount).toBeGreaterThan(0);

  const hubDevCount = await frame.locator('#node-trunk .minor-steps li.dev').count();
  const hubBuiltCount = await frame.locator('#node-trunk .minor-steps li:not(.dev)').count();
  expect(hubDevCount).toBeGreaterThan(0);
  expect(hubBuiltCount).toBeGreaterThan(0);

  await context.close();
});

test('Test 20e: Branch B and hub panels', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(BASE_URL + '#leadgenpro');
  const { frame } = await waitForFrameLoad(page);
  await waitForSettled(frame, 'overview');

  await frame.locator('#node-piqGate').click();
  await expect(frame.locator('#detailPanel')).toHaveClass(/open/);
  await expect(frame.locator('#dpTag')).toContainText('Branch B');
  await expect(frame.locator('#dpTag')).toContainText('of 10');

  await frame.locator('#node-piqApollo').click();
  await expect(frame.locator('#dpTag')).toContainText('In development');

  await frame.locator('#node-trunk').click();
  await expect(frame.locator('#dpMinorList')).toContainText('Report back required on every task');
  await expect(frame.locator('#dpMinorList')).toContainText('Grey items are in development.');
  await context.close();
});

test('Test 20d: panel shows the in-development note', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(BASE_URL + '#leadgenpro');
  const { frame } = await waitForFrameLoad(page);
  await waitForSettled(frame, 'overview');

  await frame.locator('#node-radarOrch').click();
  await expect(frame.locator('#detailPanel')).toHaveClass(/open/);
  await expect(frame.locator('#dpTag')).toContainText('Branch C');
  await expect(frame.locator('#dpTag')).toContainText('of 10');
  const devLis = await frame.locator('#dpMinorList li.dev').count();
  expect(devLis).toBeGreaterThan(0);
  await expect(frame.locator('#dpMinorList')).toContainText('Grey items are in development.');

  await frame.locator('#node-contact').click();
  await expect(frame.locator('#dpTag')).toContainText('In development');
  await context.close();
});

/* ---------------------------------------------------------------------------
   Framework v2 tests (Prompt B-fix-3). These replace the Measurement Framework
   v1 invariant tests: every gap is now owned by the framework, so the tests read
   the framework's own report and its tokens instead of restating numbers.
   --------------------------------------------------------------------------- */

test('Framework v2: Overview inspector clean', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(BASE_URL + '#leadgenpro');
  const { frame } = await waitForFrameLoad(page);

  const rep = await waitForSettled(frame, 'overview');
  expect(rep.framework).toBe('2.0.0');
  expect(rep.violations).toEqual([]);
  expect(rep.ok).toBe(true);
  await context.close();
});

test('Framework v2: Full Detail inspector clean and nothing overlaps', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(BASE_URL + '#leadgenpro');
  const { frame } = await waitForFrameLoad(page);
  await waitForSettled(frame, 'overview');

  await frame.locator('#btnMinor').click();
  const rep = await waitForSettled(frame, 'detail');
  expect(rep.violations).toEqual([]);
  expect(rep.ok).toBe(true);

  // Independent of the inspector: measure every pair of real DOM cards in canvas units.
  const minGap = await frame.evaluate(function () {
    var inner = document.getElementById('canvasInner');
    var m = /scale\(([\d.]+)\)/.exec(inner.style.transform); var z = m ? parseFloat(m[1]) : 1;
    var els = Array.prototype.slice.call(document.querySelectorAll('.node'));
    var boxes = els.map(function (el) {
      var r = el.getBoundingClientRect();
      return { id: el.id, x0: r.left / z, y0: r.top / z, x1: r.right / z, y1: r.bottom / z };
    });
    function gap(a, b) {
      var dx = Math.max(b.x0 - a.x1, a.x0 - b.x1, 0);
      var dy = Math.max(b.y0 - a.y1, a.y0 - b.y1, 0);
      var ox = !(b.x0 >= a.x1 || a.x0 >= b.x1), oy = !(b.y0 >= a.y1 || a.y0 >= b.y1);
      if (ox && oy) return -1;
      if (ox) return dy;
      if (oy) return dx;
      return Math.sqrt(dx * dx + dy * dy);
    }
    var min = Infinity;
    for (var i = 0; i < boxes.length; i++) {
      for (var j = i + 1; j < boxes.length; j++) min = Math.min(min, gap(boxes[i], boxes[j]));
    }
    return min;
  });
  expect(minGap).toBeGreaterThanOrEqual(71);
  await context.close();
});

test('Framework v2: back to Overview clean', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(BASE_URL + '#leadgenpro');
  const { frame } = await waitForFrameLoad(page);
  await waitForSettled(frame, 'overview');

  await frame.locator('#btnMinor').click();
  await waitForSettled(frame, 'detail');
  await frame.locator('#btnMajor').click();
  const rep = await waitForSettled(frame, 'overview');

  expect(rep.violations).toEqual([]);
  expect(rep.ok).toBe(true);
  await context.close();
});

test('Framework v2: chain and lane geometry in both modes', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(BASE_URL + '#leadgenpro');
  const { frame } = await waitForFrameLoad(page);

  for (const mode of ['overview', 'detail']) {
    if (mode === 'detail') await frame.locator('#btnMinor').click();
    await waitForSettled(frame, mode);

    const trunk = await canvasRect(frame, 'trunk');
    const prospector = await canvasRect(frame, 'prospector');
    const database = await canvasRect(frame, 'database');
    const crm = await canvasRect(frame, 'crm');
    const whatsapp = await canvasRect(frame, 'whatsapp');
    const coldcall = await canvasRect(frame, 'coldcall');
    const analyzer = await canvasRect(frame, 'analyzer');
    const coach = await canvasRect(frame, 'coach');

    near(prospector.x - trunk.right, 90);      // GAP_BRANCH
    near(database.x - prospector.right, 72);   // GAP_CHAIN
    near(crm.x - database.right, 72);
    near(whatsapp.x - crm.right, 90);
    near(whatsapp.x, coldcall.x);              // both lanes start in the same column
    near(coldcall.y - whatsapp.bottom, 72);
    near(analyzer.x - coldcall.right, 72);
    near(coach.x - analyzer.right, 72);
    near(coldcall.y, analyzer.y);              // lower lane is top-aligned
    near(analyzer.y, coach.y);
  }
  await context.close();
});

test('Framework v2: upper lane grows upward', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(BASE_URL + '#leadgenpro');
  const { frame } = await waitForFrameLoad(page);

  await waitForSettled(frame, 'overview');
  const before = await canvasRect(frame, 'whatsapp');

  await frame.locator('#btnMinor').click();
  await waitForSettled(frame, 'detail');
  const after = await canvasRect(frame, 'whatsapp');

  near(after.bottom, before.bottom);           // bottom fixed, so the fork pipe never moves
  expect(after.h).toBeGreaterThan(before.h);
  await context.close();
});

test('Framework v2: uniform dot speed and length-driven dot count', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(BASE_URL + '#leadgenpro');
  const { frame } = await waitForFrameLoad(page);
  await waitForSettled(frame, 'overview');

  const data = await frame.evaluate(function () {
    var r = window.__wfLayoutReport;
    return {
      simSpeed: r.simSpeed,
      tokens: { DOT_SPEED_BASE: window.WF.TOKENS.DOT_SPEED_BASE, DOT_JITTER: window.WF.TOKENS.DOT_JITTER },
      pipes: r.pipes.map(function (p) {
        return { id: p.id, kind: p.kind, dots: p.dots, len: p.len, speedMin: p.speedMin, speedMax: p.speedMax, want: window.WF.dotCount(p.len) };
      })
    };
  });

  const base = data.tokens.DOT_SPEED_BASE * data.simSpeed;
  let withDots = 0;
  data.pipes.forEach(function (p) {
    if (p.dots > 0) {
      withDots++;
      expect(p.speedMin).toBeGreaterThanOrEqual(base * 0.75 - 0.01);
      expect(p.speedMax).toBeLessThanOrEqual(base * 1.25 + 0.01);
      expect(p.dots).toBe(p.want);
    }
  });
  expect(withDots).toBeGreaterThan(0);

  const loop = data.pipes.filter(function (p) { return p.id === 'coach__crm'; })[0];
  expect(loop).toBeTruthy();
  expect(loop.kind).toBe('feedback');
  expect(loop.dots).toBe(0);
  await context.close();
});

test('Framework v2: drag moves a card and its pipes, and does not open the panel', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(BASE_URL + '#leadgenpro');
  const { frame } = await waitForFrameLoad(page);
  await waitForSettled(frame, 'overview');

  const pipeSel = 'g.pipe[data-id="prospector__database"] path';
  const pipeBefore = await frame.locator(pipeSel).getAttribute('d');
  const boxBefore = await dragNode(page, frame, 'database', 160, 50);
  const boxAfter = await frame.locator('#node-database').boundingBox();

  expect(boxAfter.x - boxBefore.x).toBeGreaterThan(100);
  expect(await frame.locator(pipeSel).getAttribute('d')).not.toBe(pipeBefore);
  await expect(frame.locator('#detailPanel')).not.toHaveClass(/open/);
  await expect(frame.locator('#wfResetLayout')).toBeVisible();

  const dragged = await frame.evaluate(function () { return window.__wfLayoutReport.dragged; });
  expect(dragged).toContain('database');
  await context.close();
});

test('Framework v2: drag survives a reload and Reset layout restores', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(BASE_URL + '#leadgenpro');
  const { frame } = await waitForFrameLoad(page);
  await waitForSettled(frame, 'overview');

  await dragNode(page, frame, 'database', 160, 50);
  const movedX = (await canvasRect(frame, 'database')).x;

  await page.reload();
  const { frame: f2 } = await waitForFrameLoad(page);
  await waitForSettled(f2, 'overview');
  near((await canvasRect(f2, 'database')).x, movedX);

  await f2.locator('#wfResetLayout').click();
  const prospector = await canvasRect(f2, 'prospector');
  near((await canvasRect(f2, 'database')).x, prospector.right + 72);
  await expect(f2.locator('#wfResetLayout')).toBeHidden();

  await page.reload();
  const { frame: f3 } = await waitForFrameLoad(page);
  await waitForSettled(f3, 'overview');
  const prospector3 = await canvasRect(f3, 'prospector');
  near((await canvasRect(f3, 'database')).x, prospector3.right + 72);
  await context.close();
});

test('Framework v2: a plain click still opens the detail panel', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(BASE_URL + '#leadgenpro');
  const { frame } = await waitForFrameLoad(page);
  await waitForSettled(frame, 'overview');

  await frame.locator('#node-crm').click();
  await expect(frame.locator('#detailPanel')).toHaveClass(/open/);
  await context.close();
});

test('Framework v2: screenshots for human review', async ({ browser }) => {
  const fs = require('fs');
  const path = require('path');
  const outDir = path.join(__dirname, '..', 'test-results', 'b-fix-3');
  fs.mkdirSync(outDir, { recursive: true });

  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await context.newPage();
  await page.goto(BASE_URL + '#leadgenpro');
  const { frame } = await waitForFrameLoad(page);
  await waitForSettled(frame, 'overview');
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(outDir, '01-overview-fit.png') });

  await frame.locator('#btnMinor').click();
  await waitForSettled(frame, 'detail');
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(outDir, '02-detail-fit.png') });

  await frame.locator('#btnMajor').click();
  await waitForSettled(frame, 'overview');
  await frame.locator('body').press('0');
  await page.waitForTimeout(200);
  await zoomTo100(frame);
  const focus = await frame.evaluate(function () {
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    ['crm', 'whatsapp', 'coldcall'].forEach(function (id) {
      var r = document.getElementById('node-' + id).getBoundingClientRect();
      x0 = Math.min(x0, r.left); y0 = Math.min(y0, r.top);
      x1 = Math.max(x1, r.right); y1 = Math.max(y1, r.bottom);
    });
    return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, vw: window.innerWidth, vh: window.innerHeight };
  });
  await panFrame(page, frame, focus.vw / 2 - focus.cx, (focus.vh + 44) / 2 - focus.cy);
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(outDir, '03-overview-branch-a-100.png') });

  await frame.locator('body').press('0');
  await page.waitForTimeout(300);
  await dragNode(page, frame, 'database', 0, 120);
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(outDir, '04-after-drag.png') });

  await context.close();
});

test('Prompt C: screenshots for human review', async ({ browser }) => {
  const fs = require('fs');
  const path = require('path');
  const outDir = path.join(__dirname, '..', 'test-results', 'lgp-branch-c');
  fs.mkdirSync(outDir, { recursive: true });

  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await context.newPage();
  await page.goto(BASE_URL + '#leadgenpro');
  const { frame } = await waitForFrameLoad(page);
  await waitForSettled(frame, 'overview');
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(outDir, '01-overview-fit.png') });

  async function focusOn(ids) {
    await frame.locator('body').press('0');
    await page.waitForTimeout(200);
    await zoomTo100(frame);
    const focus = await frame.evaluate(function (fids) {
      var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      fids.forEach(function (id) {
        var r = document.getElementById('node-' + id).getBoundingClientRect();
        x0 = Math.min(x0, r.left); y0 = Math.min(y0, r.top);
        x1 = Math.max(x1, r.right); y1 = Math.max(y1, r.bottom);
      });
      return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, vw: window.innerWidth, vh: window.innerHeight };
    }, ids);
    await panFrame(page, frame, focus.vw / 2 - focus.cx, (focus.vh + 44) / 2 - focus.cy);
    await page.waitForTimeout(300);
  }

  await focusOn(['judge', 'pattern', 'contact']);
  await page.screenshot({ path: path.join(outDir, '02-branch-c-overview-100.png') });

  await focusOn(['radarDb', 'projWriter', 'recWriter']);
  await page.screenshot({ path: path.join(outDir, '03-branch-c-forks-100.png') });

  await frame.locator('body').press('0');
  await page.waitForTimeout(200);
  await frame.locator('#btnMinor').click();
  await waitForSettled(frame, 'detail');
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(outDir, '04-detail-fit.png') });

  await focusOn(['radarOrch', 'collector', 'judge']);
  await page.screenshot({ path: path.join(outDir, '05-branch-c-detail-100.png') });

  await context.close();
});

test('Prompt B: screenshots for human review', async ({ browser }) => {
  const fs = require('fs');
  const path = require('path');
  const outDir = path.join(__dirname, '..', 'test-results', 'lgp-branch-b');
  fs.mkdirSync(outDir, { recursive: true });

  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await context.newPage();
  await page.goto(BASE_URL + '#leadgenpro');
  const { frame } = await waitForFrameLoad(page);
  await waitForSettled(frame, 'overview');
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(outDir, '01-overview-fit.png') });

  await focusOnNodes(page, frame, ['piqBrief', 'piqDiscover', 'piqGate']);
  await page.screenshot({ path: path.join(outDir, '02-branch-b-top-100.png') });

  await focusOnNodes(page, frame, ['piqExtract', 'piqApollo', 'piqLinkedin', 'piqVault']);
  await page.screenshot({ path: path.join(outDir, '03-branch-b-sides-100.png') });

  await focusOnNodes(page, frame, ['piqDossier', 'piqWriter', 'piqSend']);
  await page.screenshot({ path: path.join(outDir, '04-branch-b-bottom-100.png') });

  await focusOnNodes(page, frame, ['piqSend']);
  await frame.locator('#node-piqSend .auto-toggle').click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(outDir, '05-auto-send-on-100.png') });
  await frame.locator('#node-piqSend .auto-toggle').click();

  await frame.locator('body').press('0');
  await page.waitForTimeout(200);
  await frame.locator('#btnMinor').click();
  await waitForSettled(frame, 'detail');
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(outDir, '06-detail-fit.png') });

  await focusOnNodes(page, frame, ['trunk']);
  await page.screenshot({ path: path.join(outDir, '07-hub-detail-100.png') });

  await context.close();
});
