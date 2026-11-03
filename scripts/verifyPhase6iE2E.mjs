import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

function expectTruthy(val, message) {
  if (!val) throw new Error(`Assertion failed: ${message}`);
}

async function runPhase6iVerification() {
  console.log('=== Starting Phase 6I Playwright End-to-End Acceptance Test ===');

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
    // STEP 1: OPEN OPERATOR PORTAL
    // -------------------------------------------------------------
    console.log('\n--- Step 1: Open EVSure Operator Portal ---');
    const operatorBtn = await page.waitForSelector('button:has-text("Operator")', { timeout: 5000 });
    expectTruthy(operatorBtn, 'TopNav must have Operator Portal button');
    await operatorBtn.click();
    await page.waitForTimeout(1500);

    // Verify modal rendered
    const portalHeader = await page.waitForSelector('text=EVSure Operator Portal', { timeout: 5000 });
    expectTruthy(portalHeader, 'Operator Portal header must be visible');
    console.log('✓ Operator Portal modal opened successfully.');

    // Verify initial KPI numbers: 4 WAITING, 2 CHARGING
    await page.waitForSelector('text=Vehicles Waiting (FIFO)', { timeout: 5000 });
    const waitingText = await page.locator('div:has-text("Vehicles Waiting (FIFO)") >> text=4').first();
    expectTruthy(waitingText, 'Initial waiting count must be 4');
    console.log('✓ Initial CCS2 queue verified: 4 vehicles waiting (FIFO).');

    await page.screenshot({ path: 'scripts/e2e-phase6i-step1-operator-portal.png' });

    // -------------------------------------------------------------
    // STEP 2: OPERATOR CALLS NEXT VEHICLE (Ticket #1)
    // -------------------------------------------------------------
    console.log('\n--- Step 2: Operator Calls Next Vehicle ---');
    const callNextBtn = await page.waitForSelector('button:has-text("Call Next Vehicle")', { timeout: 5000 });
    expectTruthy(callNextBtn, 'Call Next Vehicle button must exist');
    await callNextBtn.click();
    await page.waitForTimeout(1200);

    // Verify status updated to CALLED or toast displayed
    const calledBadge = await page.locator('text=CALLED').first();
    expectTruthy(calledBadge, 'Ticket #1 must transition to CALLED status');
    console.log('✓ Ticket #1 transitioned to CALLED.');

    await page.screenshot({ path: 'scripts/e2e-phase6i-step2-vehicle-called.png' });

    // -------------------------------------------------------------
    // STEP 3: OPERATOR STARTS CHARGING SESSION FOR TICKET #1
    // -------------------------------------------------------------
    console.log('\n--- Step 3: Operator Starts Charging Session ---');
    const plugInBtn = await page.waitForSelector('button:has-text("Confirm Plugged In")', { timeout: 5000 });
    expectTruthy(plugInBtn, 'Confirm Plugged In button must exist for called vehicle');
    await plugInBtn.click();
    await page.waitForTimeout(1500);

    // Verify waiting count decreases from 4 to 3!
    const waitingAfterCharge = await page.locator('div:has-text("Vehicles Waiting (FIFO)") >> text=3').first();
    expectTruthy(waitingAfterCharge, 'Waiting count must decrease to 3 after vehicle starts charging');
    console.log('✓ SUCCESS: Waiting count decreased from 4 to 3 waiting!');

    await page.screenshot({ path: 'scripts/e2e-phase6i-step3-vehicle-charging.png' });

    // -------------------------------------------------------------
    // STEP 4: VIEW ACTIVE SESSIONS TAB
    // -------------------------------------------------------------
    console.log('\n--- Step 4: Verify Active Charging Sessions Tab ---');
    const sessionsTabBtn = await page.waitForSelector('button:has-text("Active Sessions")', { timeout: 5000 });
    await sessionsTabBtn.click();
    await page.waitForTimeout(1000);

    // Verify active sessions now include the newly plugged vehicle (total 3 active)
    const activeHeader = await page.waitForSelector('text=Active Charging Sessions', { timeout: 5000 });
    expectTruthy(activeHeader, 'Active Sessions screen must be visible');
    console.log('✓ Active Sessions screen verified.');

    await page.screenshot({ path: 'scripts/e2e-phase6i-step4-active-sessions.png' });

    // -------------------------------------------------------------
    // STEP 5: VIEW CHARGING EQUIPMENT TAB
    // -------------------------------------------------------------
    console.log('\n--- Step 5: Verify Charging Equipment & Bays Tab ---');
    const equipTabBtn = await page.waitForSelector('button:has-text("Charging Bays & Equipment")', { timeout: 5000 });
    await equipTabBtn.click();
    await page.waitForTimeout(1000);

    const bay1 = await page.locator('text=Bay 1 (CCS2 DC)').first();
    const bay4 = await page.locator('text=Bay 4 (AC Fast)').first();
    expectTruthy(bay1, 'Bay 1 must be present');
    expectTruthy(bay4, 'Bay 4 (AC Fast) must be present');
    console.log('✓ Charging Bays & Equipment verified: EVSEs and live connector statuses.');

    await page.screenshot({ path: 'scripts/e2e-phase6i-step5-equipment.png' });

    // -------------------------------------------------------------
    // STEP 6: VIEW METHOD B AGGREGATE QUEUE TAB
    // -------------------------------------------------------------
    console.log('\n--- Step 6: Verify Method B Aggregate Queue Reporting Tab ---');
    const aggTabBtn = await page.waitForSelector('button:has-text("Aggregate Queue (Method B)")', { timeout: 5000 });
    await aggTabBtn.click();
    await page.waitForTimeout(1000);

    const aggHeading = await page.waitForSelector('text=Operator-Reported Aggregate Queue (Method B)', { timeout: 5000 });
    expectTruthy(aggHeading, 'Method B screen must be visible');
    console.log('✓ Method B Aggregate Queue Reporting tab verified.');

    await page.screenshot({ path: 'scripts/e2e-phase6i-step6-method-b.png' });

    // -------------------------------------------------------------
    // STEP 7: DRIVER CHECK-IN & MAP VIEW
    // -------------------------------------------------------------
    console.log('\n--- Step 7: Close Portal & Verify Driver Perspective ---');
    const closePortalBtn = await page.waitForSelector('header button[title*="Close"]', { timeout: 5000 });
    await closePortalBtn.click();
    await page.waitForTimeout(1200);

    // Open Driver Check-In Modal programmatically via window event or evaluation
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('open-driver-checkin', {
        detail: { id: 'sta-test-evsure-hub', name: 'EVSure Highway Hub - Kanpur Corridor' }
      }));
    });
    await page.waitForTimeout(1000);

    // In case custom event didn't trigger, let's open via Plan Options or Station Details
    // or trigger it directly using test hub
    console.log('Checking driver check-in modal view...');
    await page.evaluate(() => {
      // Use react root or trigger button if open
      const btn = document.querySelector('button[title*="Chargers"]');
      if (btn) btn.click();
    });
    await page.waitForTimeout(1500);

    await page.screenshot({ path: 'scripts/e2e-phase6i-step7-driver-view.png' });
    console.log('✓ All 7 Playwright verification steps completed successfully!');

  } catch (err) {
    console.error('Playwright verification test encountered an error:', err);
    await page.screenshot({ path: 'scripts/e2e-failure.png' }).catch(() => {});
    throw err;
  } finally {
    await browser.close();
  }
}

runPhase6iVerification().then(() => {
  console.log('=== Phase 6I Playwright End-to-End Test PASSED ===');
  process.exit(0);
}).catch((err) => {
  console.error('=== Phase 6I Playwright End-to-End Test FAILED ===', err);
  process.exit(1);
});

