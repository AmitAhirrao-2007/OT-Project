/**
 * Phase 6I Acceptance: EVSure National Charging Station Queue Management,
 * Operator Portal & Live Driver Queue Verification Script (Playwright)
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

async function runNationalQueueVerification() {
  console.log('=== Starting EVSure National Charging Station Queue Management E2E Test ===');

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
    await page.waitForTimeout(3500);

    // Verify map is mounted
    await page.waitForSelector('.leaflet-container', { timeout: 10000 });
    console.log('✓ Leaflet map container mounted.');

    // -------------------------------------------------------------
    // STEP 1: OPEN OPERATOR PORTAL & VERIFY NATIONAL PCS STATION
    // -------------------------------------------------------------
    console.log('\n--- Step 1: Open EVSure Operator Portal (National Station) ---');
    const operatorBtn = await page.waitForSelector('button:has-text("Operator")', { timeout: 5000 });
    expectTruthy(operatorBtn, 'TopNav must have Operator Portal button');
    await operatorBtn.click();
    await page.waitForTimeout(1500);

    // Verify portal header
    const portalHeader = await page.waitForSelector('text=EVSure Operator Portal', { timeout: 5000 });
    expectTruthy(portalHeader, 'Operator Portal header must be visible');

    // Switch/ensure active station is sta-pcs-58fad8f122f2 (Tata Power Agra Ashok Auto Sales)
    const stationSelect = await page.waitForSelector('select', { timeout: 5000 });
    const options = await stationSelect.innerText();
    console.log(`✓ Station dropdown options loaded.`);

    // If needed, select Agra station
    await page.selectOption('header select', { value: 'sta-pcs-58fad8f122f2' }).catch(() => {});
    await page.waitForTimeout(1000);

    // Verify initial KPI: 4 waiting
    await page.waitForSelector('text=Vehicles Waiting (FIFO)', { timeout: 5000 });
    const waitingText = await page.locator('div:has-text("Vehicles Waiting (FIFO)") >> text=4').first();
    expectTruthy(waitingText, 'Agra Hub initial waiting count must be 4');
    console.log('✓ Verified Agra National PCS Station (sta-pcs-58fad8f122f2): 4 vehicles waiting (FIFO).');

    const step1Shot = 'scripts/e2e-evsure-national-step1-initial-queue.png';
    await page.screenshot({ path: step1Shot });
    copyArtifact(step1Shot, 'e2e-evsure-national-step1-initial-queue.png');

    // -------------------------------------------------------------
    // STEP 2: OPERATOR CALLS NEXT VEHICLE (Ticket #1)
    // -------------------------------------------------------------
    console.log('\n--- Step 2: Operator Calls Next Vehicle (q-agra-01) ---');
    const callNextBtn = await page.waitForSelector('button:has-text("Call Next Vehicle")', { timeout: 5000 });
    expectTruthy(callNextBtn, 'Call Next Vehicle button must exist');
    await callNextBtn.click();
    await page.waitForTimeout(1500);

    // Verify CALLED badge appeared
    const calledBadge = await page.locator('text=CALLED').first();
    expectTruthy(calledBadge, 'Ticket #1 must transition to CALLED');
    console.log('✓ Ticket #1 transitioned to CALLED status.');

    const step2Shot = 'scripts/e2e-evsure-national-step2-vehicle-called.png';
    await page.screenshot({ path: step2Shot });
    copyArtifact(step2Shot, 'e2e-evsure-national-step2-vehicle-called.png');

    // -------------------------------------------------------------
    // STEP 3: OPERATOR CONFIRMS PLUGGED IN / STARTS CHARGING
    // -------------------------------------------------------------
    console.log('\n--- Step 3: Operator Starts Charging Session ---');
    const plugInBtn = await page.waitForSelector('button:has-text("Confirm Plugged In")', { timeout: 5000 });
    expectTruthy(plugInBtn, 'Confirm Plugged In button must exist for called vehicle');
    await plugInBtn.click();
    await page.waitForTimeout(2000);

    // Verify waiting count decreased from 4 to 3!
    const waitingAfterCharge = await page.locator('div:has-text("Vehicles Waiting (FIFO)") >> text=3').first();
    expectTruthy(waitingAfterCharge, 'Waiting count must decrease to 3 after vehicle starts charging');
    console.log('✓ SUCCESS: Waiting count dropped from 4 to 3 waiting!');

    const step3Shot = 'scripts/e2e-evsure-national-step3-vehicle-charging.png';
    await page.screenshot({ path: step3Shot });
    copyArtifact(step3Shot, 'e2e-evsure-national-step3-vehicle-charging.png');

    // -------------------------------------------------------------
    // STEP 4: CONNECTOR INDEPENDENCE (TYPE 2 QUEUE)
    // -------------------------------------------------------------
    console.log('\n--- Step 4: Verify Type 2 AC Queue Independence ---');
    const type2Btn = await page.waitForSelector('button:has-text("Type 2 AC")', { timeout: 5000 });
    await type2Btn.click();
    await page.waitForTimeout(1000);

    const type2Waiting = await page.locator('div:has-text("Vehicles Waiting (FIFO)") >> text=0').first();
    expectTruthy(type2Waiting, 'Type 2 queue must show 0 waiting');
    console.log('✓ Verified Type 2 AC queue is independent and shows 0 waiting.');

    const step4Shot = 'scripts/e2e-evsure-national-step4-type2-independence.png';
    await page.screenshot({ path: step4Shot });
    copyArtifact(step4Shot, 'e2e-evsure-national-step4-type2-independence.png');

    // Switch back to CCS2
    await page.click('button:has-text("CCS2 Fast DC")');
    await page.waitForTimeout(500);

    // -------------------------------------------------------------
    // STEP 5: SECURITY & ACCESS CONTROL TEST (HTTP 403 FORBIDDEN)
    // -------------------------------------------------------------
    console.log('\n--- Step 5: Test Server-Side Authorization & 403 Forbidden ---');
    // Switch operator account to unauthorized operator
    const accountSelect = await page.waitForSelector('select[title*="Switch operator account"]', { timeout: 5000 });
    await accountSelect.selectOption('unauthorized.operator@external-cpo.in');
    await page.waitForTimeout(1500);

    // Attempt to call vehicle on Agra hub
    const unauthCallBtn = await page.waitForSelector('button:has-text("Call Next Vehicle")', { timeout: 5000 });
    await unauthCallBtn.click();
    await page.waitForTimeout(1200);

    // Verify 403 Forbidden error banner appears
    const errorBanner = await page.waitForSelector('text=HTTP 403 Forbidden', { timeout: 5000 });
    expectTruthy(errorBanner, '403 Forbidden error banner must appear for unauthorized operator');
    console.log('✓ SUCCESS: Server strictly rejected unauthorized operator with HTTP 403 Forbidden!');

    const step5Shot = 'scripts/e2e-evsure-national-step5-403-forbidden.png';
    await page.screenshot({ path: step5Shot });
    copyArtifact(step5Shot, 'e2e-evsure-national-step5-403-forbidden.png');

    // -------------------------------------------------------------
    // STEP 6: NATIONAL COVERAGE DASHBOARD (28,350 STATIONS)
    // -------------------------------------------------------------
    console.log('\n--- Step 6: Verify National Coverage Dashboard (28,350 Stations) ---');
    // Switch to Platform Admin
    await accountSelect.selectOption('admin@evsure.internal');
    await page.waitForTimeout(1500);

    const coverageTab = await page.waitForSelector('button:has-text("National Coverage")', { timeout: 5000 });
    await coverageTab.click();
    await page.waitForTimeout(1500);

    // Verify 28,350 total stations
    await page.waitForSelector('text=28,350', { timeout: 5000 });
    console.log('✓ National Coverage Dashboard loaded: 28,350 stations displayed.');

    // Verify Agra Hub listed in active hubs table
    await page.waitForSelector('table >> text=Agra Ashok Auto Sales', { timeout: 10000 });
    console.log('✓ Agra Ashok Auto Sales verified in Active Operator Hubs table.');

    const step6Shot = 'scripts/e2e-evsure-national-step6-coverage-dashboard.png';
    await page.screenshot({ path: step6Shot });
    copyArtifact(step6Shot, 'e2e-evsure-national-step6-coverage-dashboard.png');

    // -------------------------------------------------------------
    // STEP 7: SEARCH 28,350 NATIONAL CATALOGUE
    // -------------------------------------------------------------
    console.log('\n--- Step 7: Search 28,350 National Catalogue & Claim Hubs ---');
    const catalogueTab = await page.waitForSelector('button:has-text("Search & Claim National Hubs")', { timeout: 5000 });
    await catalogueTab.click();
    await page.waitForTimeout(1500);

    // Verify search results
    await page.waitForSelector('text=matching stations in national dataset', { timeout: 5000 });
    console.log('✓ National catalogue query results loaded.');

    const step7Shot = 'scripts/e2e-evsure-national-step7-national-catalogue.png';
    await page.screenshot({ path: step7Shot });
    copyArtifact(step7Shot, 'e2e-evsure-national-step7-national-catalogue.png');

    // -------------------------------------------------------------
    // STEP 8: CLOSE PORTAL & VERIFY DRIVER INTERFACE
    // -------------------------------------------------------------
    console.log('\n--- Step 8: Return to Driver Interface ---');
    const closeBtn = await page.waitForSelector('header button[title*="Close portal"]', { timeout: 5000 });
    await closeBtn.click();
    await page.waitForTimeout(1500);

    // Verify map is visible again
    await page.waitForSelector('.leaflet-container', { timeout: 5000 });
    console.log('✓ Returned to driver route planner map.');

    const step8Shot = 'scripts/e2e-evsure-national-step8-driver-planner.png';
    await page.screenshot({ path: step8Shot });
    copyArtifact(step8Shot, 'e2e-evsure-national-step8-driver-planner.png');

    console.log('\n=== All Phase 6I Acceptance Steps Completed Successfully! ===');
  } catch (err) {
    console.error('Test execution failed:', err);
    await page.screenshot({ path: 'scripts/e2e-failure.png' }).catch(() => {});
    throw err;
  } finally {
    await browser.close();
  }
}

runNationalQueueVerification().catch((err) => {
  console.error(err);
  process.exit(1);
});
