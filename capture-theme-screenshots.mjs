import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

async function capture() {
  const screenshotDir = path.resolve('docs/screenshots');
  if (!fs.existsSync(screenshotDir)) {
    fs.mkdirSync(screenshotDir, { recursive: true });
  }

  const browser = await chromium.launch({ channel: 'chrome', headless: true });

  // 1. Desktop Light Mode (Default)
  const contextLight = await browser.newContext({
    viewport: { width: 1440, height: 900 }
  });
  const pageLight = await contextLight.newPage();
  await pageLight.goto('http://127.0.0.1:3000', { waitUntil: 'networkidle' });
  await pageLight.waitForTimeout(1500);

  // Check if html has class="dark"
  const isDarkDefault = await pageLight.evaluate(() => document.documentElement.classList.contains('dark'));
  console.log('Default isDark:', isDarkDefault);

  await pageLight.screenshot({ path: path.join(screenshotDir, 'planner-light-desktop.png') });
  console.log('Captured planner-light-desktop.png');

  // Open Plan Options modal
  await pageLight.click('button:has-text("Plan Options")');
  await pageLight.waitForTimeout(600);
  await pageLight.screenshot({ path: path.join(screenshotDir, 'plan-options-light.png') });
  console.log('Captured plan-options-light.png');
  await pageLight.click('button:has-text("Done")');
  await pageLight.waitForTimeout(500);

  // Open Settings modal
  await pageLight.click('button[aria-label="Navigation menu"]');
  await pageLight.waitForTimeout(400);
  await pageLight.click('button:has-text("Display & Units")');
  await pageLight.waitForTimeout(600);
  await pageLight.screenshot({ path: path.join(screenshotDir, 'settings-light.png') });
  console.log('Captured settings-light.png');

  // Toggle theme to dark via the modal SegmentedControl
  await pageLight.click('button:has-text("Dark Charcoal")');
  await pageLight.waitForTimeout(500);
  const isDarkAfterSelect = await pageLight.evaluate(() => document.documentElement.classList.contains('dark'));
  console.log('After selecting Dark Charcoal, isDark:', isDarkAfterSelect);
  await pageLight.click('button:has-text("Save & Apply")');
  await pageLight.waitForTimeout(600);

  // Capture Dark Desktop
  await pageLight.screenshot({ path: path.join(screenshotDir, 'planner-dark-desktop.png') });
  console.log('Captured planner-dark-desktop.png');

  await contextLight.close();

  // 2. Mobile Light Mode
  const contextMobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true
  });
  const pageMobile = await contextMobile.newPage();
  await pageMobile.goto('http://127.0.0.1:3000', { waitUntil: 'networkidle' });
  await pageMobile.waitForTimeout(1500);
  await pageMobile.screenshot({ path: path.join(screenshotDir, 'planner-light-mobile.png') });
  console.log('Captured planner-light-mobile.png');

  await contextMobile.close();
  await browser.close();
  console.log('All verification captures completed successfully!');
}

capture().catch((err) => {
  console.error('Capture failed:', err);
  process.exit(1);
});
