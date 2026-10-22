import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

test('the unchanged standalone approved reference loads over HTTP and completes its KO', async ({ page }) => {
  test.skip(!process.env.QA_REFERENCE, 'Enable QA_REFERENCE with the fixture asset link to inspect the separate reference');
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:8000/reference/');
  await page.waitForFunction(() => (window as any).rookCombat?.ready());
  const canvas = page.locator('canvas');
  await expect(canvas).toHaveAttribute('width', '720'); await expect(canvas).toHaveAttribute('height', '440');
  await page.waitForTimeout(800);
  expect(await page.evaluate(() => (window as any).rookCombat.sim.started)).toBe(false);
  mkdirSync('qa-captures', { recursive: true });
  async function capture(name: string) {
    for (const [mime, ext] of [['image/png', 'png'], ['image/jpeg', 'jpg']]) {
      const image = await canvas.evaluate((node, mime) => (node as HTMLCanvasElement).toDataURL(mime, .88), mime);
      writeFileSync(`qa-captures/reference-${name}-canvas.${ext}`, Buffer.from(image.split(',')[1], 'base64'));
    }
  }
  await capture('idle'); await page.locator('[data-action="preview-ko"]').click();
  await page.waitForFunction(() => (window as any).rookCombat.enemy.deadTime >= 1.25);
  await page.evaluate(() => (window as any).rookCombat.stop());
  await capture('settled-ko');
  expect(await page.evaluate(() => (window as any).rookCombat.enemy.hp)).toBe(0);
  expect(errors).toEqual([]);
});
