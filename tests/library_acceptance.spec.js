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
