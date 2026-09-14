'use strict';
const { test, expect } = require('@playwright/test');

const BASE_URL = 'http://127.0.0.1:4173/';

async function waitForFrameLoad(page) {
  const frameHandle = await page.waitForSelector('#frame');
  const frame = await frameHandle.contentFrame();
  await frame.waitForLoadState('load');
  return { frameHandle, frame };
}

test('Test 1: Homepage cold-load', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(BASE_URL);
  const { frameHandle } = await waitForFrameLoad(page);
  const src = await frameHandle.getAttribute('src');
  expect(src.endsWith('workflows/home.html')).toBeTruthy();
  await context.close();
});

test('Test 2: Deep link beats homepage', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(BASE_URL + '#account-enrichment');
  const { frameHandle } = await waitForFrameLoad(page);
  const src = await frameHandle.getAttribute('src');
  expect(src.endsWith('workflows/account-enrichment.html')).toBeTruthy();
  await context.close();
});

test('Test 3: Desktop collapse hides the shell brand', async ({ browser }) => {
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

  await expect(page.locator('#menuPill')).toBeVisible();
  await context.close();
});

test('Test 4: Menu pill re-expands', async ({ browser }) => {
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
  await expect(page.locator('#menuPill')).toBeVisible();

  await page.click('#menuPill');

  await expect(page.locator('.sidebar')).not.toHaveClass(/collapsed/);
  await expect(page.locator('#menuPill')).not.toBeVisible();
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
  await expect(page.locator('#menuPill')).not.toBeVisible();
  await context.close();
});

test('Test 6: Iframe loads clean', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();

  const pageErrors = [];
  const consoleErrors = [];
  // Page-level listeners in Playwright capture events from every frame of
  // the page (main frame and same-origin iframes alike), which is what
  // covers "both the parent page and the iframe frame" here.
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

test('Test 7: Sanity that the workflow renders', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(BASE_URL + '#account-enrichment');
  const { frame } = await waitForFrameLoad(page);

  const nodeCount = await frame.locator('.node').count();
  expect(nodeCount).toBeGreaterThan(0);
  await expect(frame.locator('.node').first()).toBeVisible();
  await context.close();
});
