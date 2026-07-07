import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const BASE_URL = process.env.SCREENSHOT_BASE_URL ?? 'http://localhost:3417';
const OUT_DIR = path.join(process.cwd(), 'docs', 'screenshots');

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  // 1. The duplicates report.
  await page.goto(`${BASE_URL}/duplicates`, { waitUntil: 'networkidle' });
  await page.screenshot({ path: path.join(OUT_DIR, '01-duplicates-report.png') });

  // Open the Robert Chen / Bob Chen row specifically (the demo's featured merge).
  const chenRow = page.locator('tr', { hasText: 'Bob Chen' });
  await chenRow.locator('a', { hasText: 'Review & merge' }).click();
  await page.waitForLoadState('networkidle');

  // 2. Walk the merge flow to the preview step.
  await page.getByRole('radio').first().check();
  await page.getByRole('button', { name: /Next: resolve conflicts/ }).click();
  await page.getByRole('button', { name: /Next: preview/ }).click();
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(OUT_DIR, '02-merge-preview.png') });

  // 3. Execute the merge and capture the verification panel.
  await page.getByRole('button', { name: /^Merge .* into .*/ }).click();
  await page.waitForSelector('.verify-panel');
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(OUT_DIR, '03-merge-verification.png') });

  await browser.close();
  console.log('Screenshots written to', OUT_DIR);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
