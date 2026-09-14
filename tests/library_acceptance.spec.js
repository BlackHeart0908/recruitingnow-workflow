'use strict';
const { test, expect } = require('@playwright/test');

const BASE_URL = 'http://127.0.0.1:4173/';

async function waitForFrameLoad(page) {
  const frameHandle = await page.waitForSelector('#frame');
  const frame = await frameHandle.contentFrame();
  await frame.waitForLoadState('load');
  return { frameHandle, frame };
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

test('Test 13: Trunk centered in viewport', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(BASE_URL + '#leadgenpro');
  const { frame } = await waitForFrameLoad(page);
  await page.waitForTimeout(1500); // let layout settle

  const result = await frame.evaluate(function () {
    var el = document.getElementById('node-trunk');
    var r = el.getBoundingClientRect();
    return {
      cx: r.left + r.width / 2,
      cy: r.top + r.height / 2,
      vw: window.innerWidth,
      vh: window.innerHeight
    };
  });
  expect(Math.abs(result.cx - result.vw / 2)).toBeLessThan(40);
  expect(Math.abs(result.cy - result.vh / 2)).toBeLessThan(40);
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

test('Test 15: Stubs present and dimmed', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(BASE_URL + '#leadgenpro');
  const { frame } = await waitForFrameLoad(page);
  await page.waitForTimeout(500);

  const stubs = frame.locator('.node.stub');
  const count = await stubs.count();
  expect(count).toBe(3);
  for (let i = 0; i < count; i++) {
    const stub = stubs.nth(i);
    const opacity = await stub.evaluate(function (el) {
      return parseFloat(getComputedStyle(el).opacity);
    });
    expect(opacity).toBeGreaterThanOrEqual(0.35);
    expect(opacity).toBeLessThanOrEqual(0.50);
    await expect(stub).toContainText('COMING NEXT');
  }
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

test('Test 17: AI Coach feedback edge exists', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(BASE_URL + '#leadgenpro');
  const { frame } = await waitForFrameLoad(page);
  await page.waitForTimeout(500);

  const count = await frame.locator('.pipe[data-type="feedback"]').count();
  expect(count).toBeGreaterThanOrEqual(1);
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

/* Measurement Framework v1 invariant tests (Prompt B-fix-2). These replace the
   old ad-hoc "24px minimum gap" test: every gap below is asserted directly
   against the framework's own tier values, converted from screen px to canvas
   units via the live fit-to-viewport zoom read off #canvasInner's transform. */

test('Framework: Prospector clears trunk with GAP_BREATH', async ({ browser }) => {
  const GAP_BREATH = 80;
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(BASE_URL + '#leadgenpro');
  const { frame } = await waitForFrameLoad(page);
  await page.waitForTimeout(1500);

  const gapCanvas = await frame.evaluate(function () {
    var inner = document.getElementById('canvasInner');
    var m = /scale\(([\d.]+)\)/.exec(inner.style.transform);
    var zoom = m ? parseFloat(m[1]) : 1;
    var trunk = document.getElementById('node-trunk').getBoundingClientRect();
    var prospector = document.getElementById('node-prospector').getBoundingClientRect();
    var gapScreen = prospector.left - trunk.right;
    return gapScreen / zoom;
  });

  expect(gapCanvas).toBeGreaterThanOrEqual(GAP_BREATH * 0.9);
  await context.close();
});

test('Framework: consecutive Branch A axis nodes have GAP_TIGHT spacing', async ({ browser }) => {
  const GAP_TIGHT = 40;
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(BASE_URL + '#leadgenpro');
  const { frame } = await waitForFrameLoad(page);
  await page.waitForTimeout(1500);

  const gaps = await frame.evaluate(function () {
    var inner = document.getElementById('canvasInner');
    var m = /scale\(([\d.]+)\)/.exec(inner.style.transform);
    var zoom = m ? parseFloat(m[1]) : 1;
    var prospector = document.getElementById('node-prospector').getBoundingClientRect();
    var database = document.getElementById('node-database').getBoundingClientRect();
    var crm = document.getElementById('node-crm').getBoundingClientRect();
    return {
      prospectorToDatabase: (database.left - prospector.right) / zoom,
      databaseToCrm: (crm.left - database.right) / zoom
    };
  });

  expect(gaps.prospectorToDatabase).toBeGreaterThanOrEqual(GAP_TIGHT * 0.9);
  expect(gaps.prospectorToDatabase).toBeLessThanOrEqual(GAP_TIGHT * 1.15);
  expect(gaps.databaseToCrm).toBeGreaterThanOrEqual(GAP_TIGHT * 0.9);
  expect(gaps.databaseToCrm).toBeLessThanOrEqual(GAP_TIGHT * 1.15);
  await context.close();
});

test('Framework: WhatsApp and Cold Call sub-branch first nodes clear GAP_ISLAND', async ({ browser }) => {
  const GAP_ISLAND = 140;
  const NODE_W = 200;
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(BASE_URL + '#leadgenpro');
  const { frame } = await waitForFrameLoad(page);
  await page.waitForTimeout(1500);

  const distCanvas = await frame.evaluate(function () {
    var inner = document.getElementById('canvasInner');
    var m = /scale\(([\d.]+)\)/.exec(inner.style.transform);
    var zoom = m ? parseFloat(m[1]) : 1;
    var wa = document.getElementById('node-whatsapp').getBoundingClientRect();
    var cc = document.getElementById('node-coldcall').getBoundingClientRect();
    var waCy = (wa.top + wa.bottom) / 2;
    var ccCy = (cc.top + cc.bottom) / 2;
    return Math.abs(waCy - ccCy) / zoom;
  });

  expect(distCanvas).toBeGreaterThanOrEqual(GAP_ISLAND + NODE_W * 0.9);
  await context.close();
});

test('Framework: no node overlaps the trunk-clear circle', async ({ browser }) => {
  const TRUNK_CLEAR_R = 200;
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(BASE_URL + '#leadgenpro');
  const { frame } = await waitForFrameLoad(page);
  await page.waitForTimeout(1500);

  const result = await frame.evaluate(function () {
    var inner = document.getElementById('canvasInner');
    var m = /scale\(([\d.]+)\)/.exec(inner.style.transform);
    var zoom = m ? parseFloat(m[1]) : 1;
    var trunk = document.getElementById('node-trunk').getBoundingClientRect();
    var trunkCX = (trunk.left + trunk.right) / 2;
    var trunkCY = (trunk.top + trunk.bottom) / 2;
    var nodes = Array.prototype.slice.call(document.querySelectorAll('.node')).filter(function (el) {
      return !el.classList.contains('trunk');
    });
    var minDist = Infinity;
    var worst = null;
    nodes.forEach(function (el) {
      var r = el.getBoundingClientRect();
      var corners = [
        { x: r.left, y: r.top }, { x: r.right, y: r.top },
        { x: r.left, y: r.bottom }, { x: r.right, y: r.bottom }
      ];
      var nearest = Math.min.apply(null, corners.map(function (c) {
        var dx = c.x - trunkCX, dy = c.y - trunkCY;
        return Math.sqrt(dx * dx + dy * dy);
      }));
      var distCanvas = nearest / zoom;
      if (distCanvas < minDist) { minDist = distCanvas; worst = el.id; }
    });
    return { minDist: minDist, worst: worst };
  });

  if (result.minDist < TRUNK_CLEAR_R * 0.95) {
    console.log(result.worst + ' is closest to trunk at ' + Math.round(result.minDist) + ' canvas units');
  }
  expect(result.minDist).toBeGreaterThanOrEqual(TRUNK_CLEAR_R * 0.95);
  await context.close();
});
