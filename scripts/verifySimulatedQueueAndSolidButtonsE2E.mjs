/**
 * Phase 6J Acceptance: Automatic Simulated Queue Data for Unknown Stations
 * & Solid Modern Button Design (Playwright E2E Test)
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

function expectTruthy(val, message) {
  if (!val) throw new Error(`Assertion failed: ${message}`);
}

const ARTIFACTS_DIR = 'C:\\Users\\abhis\\.gemini\\antigravity\\brain\\419b16d2-67bc-4441-b5d2-e80a52cc8f51';

function copyArtifact(srcPath, destFilename) {
  try {
    if (fs.existsSync(srcPath)) {
      const dest = path.join(ARTIFACTS_DIR, destFilename);
      fs.copyFileSync(srcPath, dest);
      console.log(`✓ Copied artifact: ${destFilename}`);
    }
  } catch (err) {
    console.warn(`Could not copy artifact ${destFilename}:`, err.message);
  }
}

async function runE2E() {
  console.log('=== Starting Phase 6J E2E Verification ===');

  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 }
  });
  const page = await context.newPage();

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      console.log(`[Browser Console Error] ${msg.text()}`);
    }
  });

  try {
    console.log('1. Navigating to http://127.0.0.1:3000/ ...');
    await page.goto('http://127.0.0.1:3000/', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    await page.waitForTimeout(3000);

    // STEP 1: Check simulated queue badges on route stops & corridor stations
    console.log('2. Inspecting map markers for simulated queue badges...');
    const simulatedBadges = await page.locator('.leaflet-marker-icon:has-text("SIMULATED")').all();
    console.log(`   Found ${simulatedBadges.length} map badges displaying "SIMULATED".`);
    expectTruthy(simulatedBadges.length > 0, 'At least one charging station marker should display a SIMULATED queue badge');

    // Verify badge text format (e.g. "X waiting · SIMULATED")
    const firstBadgeText = await simulatedBadges[0].textContent();
    console.log(`   First badge text: "${firstBadgeText.trim()}"`);
    expectTruthy(firstBadgeText.includes('waiting · SIMULATED'), 'Badge must follow format "X waiting · SIMULATED"');

    const step1Screenshot = 'scripts/e2e-step1-simulated-queue-badges.png';
    await page.screenshot({ path: step1Screenshot });
    copyArtifact(step1Screenshot, 'e2e-step1-simulated-queue-badges.png');

    // STEP 2: Click on Stop #4 (which has simulated queue) to inspect popup breakdown
    console.log('3. Clicking Stop #4 marker to inspect popup breakdown...');
    await page.evaluate(() => {
      const markerEl = Array.from(document.querySelectorAll('.custom-map-marker')).find(el => el.textContent.includes('#4'));
      if (markerEl) {
        markerEl.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      }
    });
    await page.waitForTimeout(1000);

    const popupContent = await page.locator('.leaflet-popup-content').textContent();
    console.log(`   Popup text snippet: "${popupContent.replace(/\s+/g, ' ').slice(0, 150)}..."`);
    expectTruthy(popupContent.includes('Status: SIMULATED — NOT LIVE'), 'Popup must display "Status: SIMULATED — NOT LIVE"');
    expectTruthy(popupContent.includes('Source: EVSure simulated queue'), 'Popup must display "Source: EVSure simulated queue"');
    expectTruthy(popupContent.includes('Confidence: Illustrative only'), 'Popup must display "Confidence: Illustrative only"');

    const step2Screenshot = 'scripts/e2e-step2-simulated-popup.png';
    await page.screenshot({ path: step2Screenshot });
    copyArtifact(step2Screenshot, 'e2e-step2-simulated-popup.png');

    // STEP 3: Check Smart Charging Recommendations for simulated queue label
    console.log('4. Inspecting Smart Charging Recommendations section...');
    const recommendationsNotice = page.locator('text=Recommendation uses simulated queue data');
    const isNoticeVisible = await recommendationsNotice.isVisible();
    console.log(`   Recommendations notice "Recommendation uses simulated queue data" visible: ${isNoticeVisible}`);
    expectTruthy(isNoticeVisible, 'Recommendation uses simulated queue data notice must be visible');

    const step3Screenshot = 'scripts/e2e-step3-recommendations-simulated.png';
    await page.screenshot({ path: step3Screenshot });
    copyArtifact(step3Screenshot, 'e2e-step3-recommendations-simulated.png');

    // STEP 4: Open Plan Options modal to check Simulated Queue Data toggle & refresh button
    console.log('5. Opening Plan Options Modal...');
    const planOptionsBtn = page.locator('button:has-text("Plan Options")');
    await planOptionsBtn.click();
    await page.waitForTimeout(1000);

    const simToggle = page.locator('#toggle-simulated-queues');
    const isSimToggleVisible = await simToggle.isVisible();
    expectTruthy(isSimToggleVisible, 'Simulated queue toggle switch must be present in Plan Options');
    console.log('   Simulated Queue Data toggle is visible and active.');

    const refreshQueuesBtn = page.locator('button:has-text("Refresh Queues")');
    const isRefreshVisible = await refreshQueuesBtn.isVisible();
    expectTruthy(isRefreshVisible, 'Refresh Queues button must be present when simulation is enabled');
    console.log('   Clicking "Refresh Queues" button...');
    await refreshQueuesBtn.click();
    await page.waitForTimeout(1000);

    const step4Screenshot = 'scripts/e2e-step4-plan-options-simulated-settings.png';
    await page.screenshot({ path: step4Screenshot });
    copyArtifact(step4Screenshot, 'e2e-step4-plan-options-simulated-settings.png');

    // STEP 5: Test Disabling Simulated Queues
    console.log('6. Disabling Simulated Queues...');
    await page.locator('label:has-text("Enable Simulated Queues")').click({ force: true });
    await page.waitForTimeout(500);

    // Close Plan Options modal
    const closeBtn = page.locator('button[aria-label="Close dialog"]');
    await closeBtn.click();
    await page.waitForTimeout(1000);

    // Verify map markers now show "Queue unknown" when simulation disabled
    const unknownBadges = await page.locator('.leaflet-marker-icon:has-text("Queue unknown")').all();
    console.log(`   Found ${unknownBadges.length} markers showing "Queue unknown" after disabling simulation.`);
    expectTruthy(unknownBadges.length > 0, 'Markers should display Queue unknown when simulation is turned off');

    const step5Screenshot = 'scripts/e2e-step5-simulation-disabled.png';
    await page.screenshot({ path: step5Screenshot });
    copyArtifact(step5Screenshot, 'e2e-step5-simulation-disabled.png');

    // STEP 6: Re-enable Simulated Queues and Verify Solid Buttons UI (No Glassmorphism)
    console.log('7. Re-enabling Simulated Queues and verifying solid UI button design...');
    await planOptionsBtn.click();
    await page.waitForTimeout(800);
    await page.locator('label:has-text("Enable Simulated Queues")').click({ force: true });
    await page.waitForTimeout(500);
    await closeBtn.click();
    await page.waitForTimeout(1000);

    // Verify glassmorphism removal on buttons
    const backdropBlurButtons = await page.locator('button.backdrop-blur-md, button.backdrop-blur-sm').all();
    console.log(`   Buttons with backdrop-blur classes: ${backdropBlurButtons.length} (Expected: 0)`);
    expectTruthy(backdropBlurButtons.length === 0, 'No buttons should contain backdrop-blur glassmorphism classes');

    // Verify solid buttons on TopNav
    const operatorBtn = page.locator('button[title*="Operator Portal"]');
    const operatorBtnClass = await operatorBtn.getAttribute('class');
    console.log(`   Operator button class: ${operatorBtnClass}`);
    expectTruthy(operatorBtnClass.includes('bg-violet-700'), 'Operator button should use solid bg-violet-700');
    expectTruthy(!operatorBtnClass.includes('backdrop-blur'), 'Operator button must not have backdrop-blur');

    // Verify solid zoom controls
    const zoomInBtn = page.locator('button[data-testid="map-zoom-in"]');
    expectTruthy(await zoomInBtn.isVisible(), 'Map zoom in button must be visible');

    const step6Screenshot = 'scripts/e2e-step6-solid-buttons-ui.png';
    await page.screenshot({ path: step6Screenshot });
    copyArtifact(step6Screenshot, 'e2e-step6-solid-buttons-ui.png');

    console.log('\n=== All Phase 6J E2E Checks Passed Successfully! ===');
  } catch (err) {
    console.error('E2E Verification Error:', err);
    await page.screenshot({ path: 'scripts/e2e-failure.png' });
    copyArtifact('scripts/e2e-failure.png', 'e2e-failure.png');
    throw err;
  } finally {
    await browser.close();
  }
}

runE2E();
