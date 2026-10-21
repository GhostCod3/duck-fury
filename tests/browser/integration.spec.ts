import { test, expect, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

type Snapshot = {
  mode: string; status: string; time: number; cameraX: number;
  player: { x: number; y: number; hp: number; attack: string | null };
  enemy: { x: number; y: number; hp: number };
  views: Record<'player' | 'enemy', { renderer: string; wounds: number; scale: number; complete: boolean; deadTime: number; pose: { front: {x:number;y:number}; back: {x:number;y:number}; hip: {x:number;y:number}; headAngle: number }; spring: object }>;
  blood: { droplets: object[]; stains: Array<{x:number;y:number}> };
  resources: { variants: number; textures: number; transient: number };
};
const snapshot = (page: Page): Promise<Snapshot> => page.evaluate(() => (window as any).__duckFury.snapshot());
const setup = (page: Page, options: object = {}) => page.evaluate(options => (window as any).__duckFury.setup(options), options);
async function ready(page: Page) {
  await page.goto('./');
  await expect(page.locator('#loading')).toBeHidden();
  await page.waitForFunction(() => !!(window as any).__duckFury?.snapshot().views);
}
async function capture(page: Page, name: string) {
  mkdirSync('qa-captures', { recursive: true });
  await page.locator('#game-frame').screenshot({ path: `qa-captures/${name}.png` });
  const canvas = await page.locator('#game-canvas canvas').evaluate(node => (node as HTMLCanvasElement).toDataURL('image/png'));
  writeFileSync(`qa-captures/${name}-canvas.png`, Buffer.from(canvas.split(',')[1], 'base64'));
}

test('ready idle, upright anchors, independent timing, both facings, and pause', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await ready(page);
  const first = await snapshot(page);
  expect(first.views.player.renderer).toBe('rig'); expect(first.views.enemy.renderer).toBe('rig');
  expect(first.resources.variants).toBe(64);
  await page.waitForTimeout(800); const idle = await snapshot(page);
  expect(idle.time).toBe(0); expect(idle.player.x).toBe(first.player.x); expect(idle.enemy.x).toBe(first.enemy.x);
  expect(idle.views.player.pose.front.x).toBe(274); expect(idle.views.player.pose.front.y).toBe(354);
  expect(idle.views.player.pose.back.x).toBe(226); expect(idle.views.player.pose.hip.y).toBeLessThan(232);
  expect(idle.views.player.pose.headAngle).not.toBe(first.views.player.pose.headAngle);
  expect(idle.views.player.pose.headAngle).not.toBe(idle.views.enemy.pose.headAngle);
  await capture(page, 'after-ready-idle');
  await setup(page); await capture(page, 'after-facing-right'); await page.keyboard.press('Escape');
  const paused = await snapshot(page); await page.waitForTimeout(250);
  expect((await snapshot(page)).views).toEqual(paused.views); expect((await snapshot(page)).time).toBe(paused.time);
  await page.keyboard.press('Escape'); await setup(page, { left: true });
  await capture(page, 'after-facing-left');
  await page.locator('#help-button').click(); await expect(page.locator('#help-dialog')).toBeVisible();
  await page.locator('#help-done').click(); await expect(page.locator('#help-dialog')).toBeHidden();
  expect(errors).toEqual([]);
});

test('authoritative hits, misses, combo buffering, victim wounds, complete KO, and replay cleanup', async ({ page }) => {
  await ready(page); await setup(page, { miss: true }); await page.keyboard.press('j');
  await page.waitForTimeout(180); let state = await snapshot(page);
  expect(state.enemy.hp).toBe(120); expect(state.blood.droplets).toHaveLength(0); expect(state.views.enemy.wounds).toBe(0);
  await setup(page); await page.keyboard.press('j');
  await page.waitForFunction(() => (window as any).__duckFury.snapshot().enemy.hp === 107);
  await page.keyboard.press('Escape'); state = await snapshot(page);
  expect(state.views.enemy.wounds).toBe(1); expect(state.views.player.wounds).toBe(0);
  expect(state.blood.droplets.length).toBeGreaterThan(0); await capture(page, 'after-hit');
  await setup(page); await page.keyboard.press('j');
  await page.waitForFunction(() => (window as any).__duckFury.snapshot().player.attack === 'punch1');
  await page.keyboard.press('j');
  await page.waitForFunction(() => (window as any).__duckFury.snapshot().player.attack === 'punch2');
  await page.keyboard.press('j');
  await page.waitForFunction(() => (window as any).__duckFury.snapshot().enemy.hp === 65, undefined, { timeout: 4000 });
  await setup(page, { lethal: true }); await page.keyboard.press('j');
  await page.waitForFunction(() => (window as any).__duckFury.snapshot().status === 'won');
  const falling = await snapshot(page); expect(falling.views.enemy.complete).toBe(false);
  await expect(page.locator('#state-overlay')).toBeHidden();
  await page.keyboard.press('Escape'); const frozen = await snapshot(page);
  await page.waitForTimeout(200); expect((await snapshot(page)).views.enemy).toEqual(frozen.views.enemy);
  await page.keyboard.press('Escape');
  await expect(page.locator('#state-title')).toHaveText('DUST SETTLED.');
  const settled = await snapshot(page); expect(settled.views.enemy.complete).toBe(true);
  expect(settled.views.enemy.scale).toBe(falling.views.enemy.scale);
  await capture(page, 'after-settled-ko'); await page.waitForTimeout(400);
  expect((await snapshot(page)).views.enemy).toEqual(settled.views.enemy);
  const resources = settled.resources;
  for (let i = 0; i < 8; i++) await setup(page);
  state = await snapshot(page); expect(state.views.enemy.wounds).toBe(0); expect(state.views.player.wounds).toBe(0);
  expect(state.blood.droplets).toHaveLength(0); expect(state.blood.stains).toHaveLength(0);
  expect(state.resources.transient).toBe(0); expect(state.resources.textures).toBe(resources.textures); expect(state.resources.variants).toBe(resources.variants);
  await setup(page, { edge: true }); expect((await snapshot(page)).cameraX).toBe(1320); await capture(page, 'after-stage-right-edge');
});

test('landscape mobile multitouch, cancellation, rotation, sound and visibility pause', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 915, height: 412 }, hasTouch: true, isMobile: true });
  const page = await context.newPage(); await page.goto('http://127.0.0.1:5173/duck-fury/');
  await expect(page.locator('#loading')).toBeHidden(); await page.locator('#start-button').tap();
  const start = await snapshot(page), pad = (await page.locator('#dpad').boundingBox())!, punch = (await page.locator('#punch-button').boundingBox())!;
  const cdp = await context.newCDPSession(page);
  const thumb = { x: pad.x + pad.width * .78, y: pad.y + pad.height * .5, id: 1 };
  const fist = { x: punch.x + punch.width / 2, y: punch.y + punch.height / 2, id: 2 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [thumb] });
  await page.waitForTimeout(220);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [thumb, fist] });
  await page.waitForTimeout(80);
  expect((await snapshot(page)).player.attack).toBe('punch1'); expect((await snapshot(page)).player.x).toBeGreaterThan(start.player.x);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await page.waitForTimeout(450); const released = await snapshot(page); await page.waitForTimeout(150);
  expect((await snapshot(page)).player.x).toBe(released.player.x);
  await page.locator('#sound-button').tap(); await expect(page.locator('#sound-button')).toHaveAttribute('aria-label', 'Enable sound');
  await capture(page, 'after-mobile-landscape');
  await page.setViewportSize({ width: 412, height: 915 }); await expect(page.locator('.rotate-hint')).toBeVisible(); expect((await snapshot(page)).mode).toBe('paused');
  await page.setViewportSize({ width: 915, height: 412 }); await page.locator('#resume-button').tap();
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
  expect((await snapshot(page)).mode).toBe('paused'); const paused = await snapshot(page); await page.waitForTimeout(200); expect((await snapshot(page)).time).toBe(paused.time);
  await context.close();
});

test('production prefix, image MIME types, no development hooks, and graceful rig fallback', async ({ page, browser }) => {
  const assets = new Map<string, {status:number;mime:string}>();
  page.on('response', response => { if (response.url().includes('/assets/rig/') || response.url().includes('/assets/world/')) assets.set(response.url(), { status: response.status(), mime: response.headers()['content-type'] ?? '' }); });
  await page.goto('http://127.0.0.1:4173/duck-fury/'); await expect(page.locator('#loading')).toBeHidden();
  expect(assets.size).toBe(13);
  for (const [url, result] of assets) { expect(url).toContain('/duck-fury/assets/'); expect(result.status).toBe(200); expect(result.mime).toContain('image/webp'); }
  expect(await page.evaluate(() => (window as any).__duckFury)).toBeUndefined();
  await page.locator('#start-button').click(); await expect(page.locator('#enemy-hud')).toBeVisible();
  const context = await browser.newContext(); const fallback = await context.newPage();
  await fallback.route('**/assets/rig/head.webp', route => route.abort());
  await fallback.goto('http://127.0.0.1:5173/duck-fury/'); await expect(fallback.locator('#loading')).toBeHidden();
  expect((await snapshot(fallback)).views.player.renderer).toBe('fallback');
  await fallback.locator('#start-button').click(); expect((await snapshot(fallback)).mode).toBe('playing');
  await context.close();
});

test('capture the actual unmodified baseline before comparison', async ({ page }) => {
  test.skip(!process.env.QA_BASELINE, 'Baseline checkout is supplied by the PR verification workflow');
  await page.goto('http://127.0.0.1:5174/duck-fury/'); await expect(page.locator('#loading')).toBeHidden();
  await capture(page, 'before-ready-idle'); await page.locator('#start-button').click();
  await capture(page, 'before-facing-right'); await page.keyboard.down('a'); await page.waitForTimeout(80); await page.keyboard.up('a'); await capture(page, 'before-facing-left');
  let hit = false;
  for (let i = 0; i < 150; i++) {
    const s = await snapshot(page);
    if (s.status === 'won') { await capture(page, 'before-settled-ko'); break; }
    if (s.status === 'lost') throw new Error('Baseline fight lost before comparison capture');
    if (!hit && s.enemy.hp < 120) { hit = true; await capture(page, 'before-hit'); }
    const dx = s.enemy.x - s.player.x;
    if (Math.abs(dx) > 75) await page.keyboard.down(dx > 0 ? 'd' : 'a');
    else { await page.keyboard.up('d'); await page.keyboard.up('a'); await page.keyboard.press('j'); }
    await page.waitForTimeout(100);
  }
  expect(hit).toBe(true); expect((await snapshot(page)).status).toBe('won');
});
