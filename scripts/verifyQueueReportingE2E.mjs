import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

async function runE2E() {
  console.log('--- Starting Phase 6G.2 Playwright End-to-End Verification ---');
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
    await page.waitForTimeout(4000);

    // Verify map is loaded
    await page.waitForSelector('.leaflet-container', { timeout: 10000 });
    console.log('✓ Leaflet map container is mounted.');

    // Wait for custom map markers to be present
    await page.waitForSelector('.custom-map-marker', { timeout: 10000 });
    const markers = await page.$$('.custom-map-marker');
    console.log(`✓ Found ${markers.length} markers on the map.`);

    // Take screenshot of default state
    await page.screenshot({ path: 'scripts/e2e-step1-default-route.png' });
    console.log('✓ Captured scripts/e2e-step1-default-route.png');

    // Check text inside map markers to verify queue counts
    const markerTexts = await page.$$eval('.custom-map-marker', (elements) =>
      elements.map((el) => el.innerText.replace(/\s+/g, ' ').trim())
    );
    console.log('Marker text samples:', markerTexts);

    const has4Waiting = markerTexts.some((t) => t.includes('4 waiting'));
    const has1Waiting = markerTexts.some((t) => t.includes('1 waiting'));
    const has0Waiting = markerTexts.some((t) => t.includes('0 waiting'));
    const hasQueueUnknown = markerTexts.some((t) => t.includes('Queue unknown'));

    console.log(`- Badge '4 waiting' present: ${has4Waiting}`);
    console.log(`- Badge '1 waiting' present: ${has1Waiting}`);
    console.log(`- Badge '0 waiting' present: ${has0Waiting}`);
    console.log(`- Badge 'Queue unknown' present: ${hasQueueUnknown}`);

    if (!has4Waiting || !has1Waiting || !has0Waiting || !hasQueueUnknown) {
      throw new Error(`Queue badges missing expected states: 4 waiting=${has4Waiting}, 1 waiting=${has1Waiting}, 0 waiting=${has0Waiting}, Queue unknown=${hasQueueUnknown}`);
    }

    // 2. Click Stop 1 (4 waiting) marker to verify popup
    console.log('2. Clicking Stop 1 (4 waiting) marker...');
    // Find the marker containing '4 waiting'
    const stop1Marker = page.locator('.custom-map-marker:has-text("4 waiting")').first();
    await stop1Marker.click();
    await page.waitForTimeout(1000);

    // Verify Leaflet popup opened
    await page.waitForSelector('.leaflet-popup-content', { timeout: 5000 });
    const popup1Text = await page.locator('.leaflet-popup-content').innerText();
    console.log('Stop 1 Popup Content:\n', popup1Text);

    if (!popup1Text.includes('4 vehicles waiting') && !popup1Text.includes('4 waiting')) {
      throw new Error('Stop 1 popup does not show 4 waiting count');
    }
    if (!popup1Text.includes('Community report')) {
      throw new Error('Stop 1 popup does not indicate Community report data source');
    }
    await page.screenshot({ path: 'scripts/e2e-step2-stop1-popup.png' });
    console.log('✓ Captured scripts/e2e-step2-stop1-popup.png');

    // Close popup
    await page.click('.leaflet-popup-close-button');
    await page.waitForTimeout(500);

    // 3. Click Stop 3 (0 waiting) marker to verify zero-waiting label
    console.log('3. Clicking Stop 3 (0 waiting) marker...');
    const stop3Marker = page.locator('.custom-map-marker:has-text("0 waiting")').first();
    await stop3Marker.click();
    await page.waitForTimeout(1000);

    const popup3Text = await page.locator('.leaflet-popup-content').innerText();
    console.log('Stop 3 Popup Content:\n', popup3Text);

    if (!popup3Text.includes('0 vehicles reported waiting')) {
      throw new Error('Stop 3 popup does not show "0 vehicles reported waiting"');
    }
    await page.screenshot({ path: 'scripts/e2e-step3-stop3-popup.png' });
    console.log('✓ Captured scripts/e2e-step3-stop3-popup.png');

    await page.click('.leaflet-popup-close-button');
    await page.waitForTimeout(500);

    // 4. Click Stop 4 (Queue unknown) marker to verify explanation and Report button
    console.log('4. Clicking Stop 4 (Queue unknown) marker...');
    const unknownMarker = page.locator('.custom-map-marker:has-text("Queue unknown")').first();
    await unknownMarker.click();
    await page.waitForTimeout(1000);

    const popup4Text = await page.locator('.leaflet-popup-content').innerText();
    console.log('Stop 4 (Unknown) Popup Content:\n', popup4Text);

    if (!popup4Text.includes('Nobody has submitted a recent queue report for this connector.')) {
      throw new Error('Stop 4 popup does not show "Nobody has submitted a recent queue report for this connector."');
    }

    // Verify Report current queue button is present
    const reportBtnInPopup = page.locator('.leaflet-popup-content button:has-text("Report current queue")');
    await reportBtnInPopup.waitFor({ state: 'visible', timeout: 5000 });
    console.log('✓ "Report current queue" button is visible in popup.');

    await page.screenshot({ path: 'scripts/e2e-step4-queue-unknown-popup.png' });
    console.log('✓ Captured scripts/e2e-step4-queue-unknown-popup.png');

    // 5. Click "Report current queue" to open QueueReportModal
    console.log('5. Clicking "Report current queue" button...');
    await reportBtnInPopup.click();
    await page.waitForTimeout(1000);

    // Verify QueueReportModal opened
    await page.waitForSelector('text=Live Station Queue Report', { timeout: 5000 });
    console.log('✓ QueueReportModal is open.');

    // Select '4+ Vehicles Waiting'
    const fourWaitingBtn = page.locator('button:has-text("4+ Vehicles Waiting")');
    await fourWaitingBtn.click();
    console.log('✓ Selected "4+ Vehicles Waiting" option.');

    await page.screenshot({ path: 'scripts/e2e-step5-queue-report-modal.png' });
    console.log('✓ Captured scripts/e2e-step5-queue-report-modal.png');

    // Submit report
    const submitBtn = page.locator('button[type="submit"]');
    await submitBtn.click();
    console.log('✓ Clicked Send Report.');

    // Wait for submission feedback & modal close
    await page.waitForTimeout(2500);

    // 6. Verify Stop 4 marker badge updated from "Queue unknown" to "4 waiting"
    console.log('6. Verifying Stop 4 marker badge dynamically updated...');
    await page.waitForTimeout(2000);

    const updatedMarkerTexts = await page.$$eval('.custom-map-marker', (elements) =>
      elements.map((el) => el.innerText.replace(/\s+/g, ' ').trim())
    );
    console.log('Updated marker text samples:', updatedMarkerTexts);

    // Count how many markers now have '4 waiting' (was 1, should now be at least 2)
    const count4Waiting = updatedMarkerTexts.filter((t) => t.includes('4 waiting')).length;
    console.log(`Number of markers with "4 waiting": ${count4Waiting}`);

    if (count4Waiting < 2) {
      throw new Error(`Expected at least two stations with "4 waiting" after submission, got ${count4Waiting}`);
    }

    await page.screenshot({ path: 'scripts/e2e-step6-stop4-updated-badge.png' });
    console.log('✓ Captured scripts/e2e-step6-stop4-updated-badge.png');

    // 7. Click the updated Stop 4 marker and verify its popup shows the newly submitted report
    console.log('7. Clicking Stop 4 to verify updated popup details...');
    const all4Markers = page.locator('.custom-map-marker:has-text("4 waiting")');
    const second4Marker = all4Markers.nth(1);
    await second4Marker.click();
    await page.waitForTimeout(1000);

    const updatedPopupText = await page.locator('.leaflet-popup-content').innerText();
    console.log('Updated Stop 4 Popup Content:\n', updatedPopupText);

    if (!updatedPopupText.includes('4 vehicles waiting') && !updatedPopupText.includes('4 waiting')) {
      throw new Error('Updated Stop 4 popup does not show 4 waiting count');
    }
    if (!updatedPopupText.includes('Community report')) {
      throw new Error('Updated Stop 4 popup does not show Community report data source');
    }

    await page.screenshot({ path: 'scripts/e2e-step7-stop4-updated-popup.png' });
    console.log('✓ Captured scripts/e2e-step7-stop4-updated-popup.png');

    console.log('=====================================================');
    console.log('🎉 ALL PLAYWRIGHT E2E QUEUE VERIFICATION CHECKS PASSED!');
    console.log('=====================================================');
  } catch (err) {
    console.error('❌ E2E Verification failed:', err);
    await page.screenshot({ path: 'scripts/e2e-failure.png' }).catch(() => {});
    process.exit(1);
  } finally {
    await browser.close();
  }
}

runE2E();
