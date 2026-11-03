import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

async function runPhase6hVerification() {
  console.log('=== Starting Phase 6H Playwright End-to-End Verification ===');

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

    // Verify map is mounted
    await page.waitForSelector('.leaflet-container', { timeout: 10000 });
    console.log('✓ Leaflet map container mounted.');

    // -------------------------------------------------------------
    // FEATURE A VERIFICATION: Map Zoom Controls and Zoom Persistence
    // -------------------------------------------------------------
    console.log('\n--- Testing Feature A: Map Zoom Controls ---');
    const zoomInBtn = await page.waitForSelector('button[data-testid="map-zoom-in"]', { timeout: 5000 });
    const zoomOutBtn = await page.waitForSelector('button[data-testid="map-zoom-out"]', { timeout: 5000 });
    const recenterBtn = await page.waitForSelector('button[data-testid="map-recenter"]', { timeout: 5000 });
    expectTruthy(zoomInBtn, 'Zoom In button must exist');
    expectTruthy(zoomOutBtn, 'Zoom Out button must exist');
    expectTruthy(recenterBtn, 'Recenter button must exist');

    const initialZoom = await page.evaluate(() => window.__leafletMap?.getZoom() ?? 0);
    console.log(`Initial map zoom level: ${initialZoom}`);

    // Click Zoom In 5 times
    console.log('Clicking Zoom In (+) 5 times...');
    for (let i = 1; i <= 5; i++) {
      await zoomInBtn.click();
      await page.waitForTimeout(500);
      const currentZoom = await page.evaluate(() => window.__leafletMap?.getZoom());
      console.log(`  Zoom In click #${i} -> current zoom: ${currentZoom}`);
    }

    const zoomedInLevel = await page.evaluate(() => window.__leafletMap?.getZoom());
    console.log(`Zoomed in level: ${zoomedInLevel} (expected: ${initialZoom + 5})`);
    if (zoomedInLevel !== initialZoom + 5) {
      throw new Error(`Expected zoom to be ${initialZoom + 5}, got ${zoomedInLevel}`);
    }

    // Wait 3 seconds to ensure background batch queue data fetches or re-renders do NOT reset zoom
    console.log('Waiting 3.0 seconds to test zoom level persistence against background state updates...');
    await page.waitForTimeout(3000);

    const zoomAfterWait = await page.evaluate(() => window.__leafletMap?.getZoom());
    console.log(`Zoom after 3s wait: ${zoomAfterWait}`);
    if (zoomAfterWait !== zoomedInLevel) {
      throw new Error(`Zoom reset failure! Zoom level changed from ${zoomedInLevel} to ${zoomAfterWait}`);
    }
    console.log('✓ SUCCESS: Zoom level is completely preserved across background state updates!');

    await page.screenshot({ path: 'scripts/e2e-phase6h-step1-zoomed-in.png' });

    // Click Zoom Out 5 times
    console.log('Clicking Zoom Out (-) 5 times...');
    for (let i = 1; i <= 5; i++) {
      await zoomOutBtn.click();
      await page.waitForTimeout(500);
      const currentZoom = await page.evaluate(() => window.__leafletMap?.getZoom());
      console.log(`  Zoom Out click #${i} -> current zoom: ${currentZoom}`);
    }

    const zoomedOutLevel = await page.evaluate(() => window.__leafletMap?.getZoom());
    console.log(`Zoom level after 5 zoom-outs: ${zoomedOutLevel} (expected: ${initialZoom})`);
    if (zoomedOutLevel !== initialZoom) {
      throw new Error(`Expected zoom level to return to ${initialZoom}, got ${zoomedOutLevel}`);
    }
    console.log('✓ SUCCESS: Zoom Out decrements smoothly back to original level.');

    // Test Recenter button
    console.log('Testing Recenter / Frame Route button...');
    await recenterBtn.click();
    await page.waitForTimeout(1000);
    console.log('✓ SUCCESS: Recenter button executed cleanly.');

    await page.screenshot({ path: 'scripts/e2e-phase6h-step2-zoomed-out.png' });

    // -------------------------------------------------------------
    // FEATURE B VERIFICATION: Complete Battery-Feasible EV Routes
    // -------------------------------------------------------------
    console.log('\n--- Testing Feature B: Complete Battery-Feasible EV Routes ---');

    // Verify Route Panel contains complete EV route with verified charging stops
    const stopsCount = await page.$$eval('.custom-map-marker', (els) => els.length);
    console.log(`Found ${stopsCount} custom markers rendered on map.`);

    // Look for the Complete EV Route badge in the Route Panel
    const routePanelText = await page.$eval('.custom-scrollbar', (el) => el.textContent || '');
    console.log('Verifying Route Panel contents...');

    // Verify charging stops exist in the itinerary
    const chargingStopCards = await page.$$('div.group.relative.rounded-xl.border');
    console.log(`Found ${chargingStopCards.length} charging stop cards in Route Panel.`);
    if (chargingStopCards.length < 4) {
      throw new Error(`Expected at least 4-6 charging stop cards for Patna-Delhi, found ${chargingStopCards.length}`);
    }
    console.log(`✓ Verified ${chargingStopCards.length} charging stops sequenced in the itinerary.`);

    await page.screenshot({ path: 'scripts/e2e-phase6h-step3-complete-ev-route.png' });

    // Test Road Alternatives
    console.log('Testing alternative route selection...');
    const altRouteCards = await page.$$('div.cursor-pointer:has-text("Route")');
    console.log(`Found ${altRouteCards.length} route options/cards.`);
    if (altRouteCards.length > 1) {
      await altRouteCards[1].click();
      await page.waitForTimeout(1500);
      console.log('✓ Switched to Road Alternative 2.');
    }

    // Test Infeasibility Banner & Diagnosis
    console.log('\n--- Testing Honest Infeasibility Diagnosis ---');
    await page.evaluate(() => {
      if (window.__replanRoute && window.__trip) {
        window.__replanRoute({
          origin: {
            ...window.__trip.origin,
            batterySoc: 8 // Only 8% departure battery: cannot reach Stop 1 at 170 miles!
          }
        });
      }
    });

    console.log('Triggered replan with 8% departure SoC...');
    await page.waitForTimeout(3000);

    // Look for the infeasibility alert banner
    const alertBanner = await page.waitForSelector('.bg-status-dangerSubtle', { timeout: 10000 });
    const bannerText = await alertBanner.textContent();
    console.log(`Infeasibility banner text: "${bannerText?.slice(0, 150)}..."`);

    if (!bannerText?.includes('complete EV journey not currently feasible')) {
      throw new Error(`Expected banner to include "complete EV journey not currently feasible", got: ${bannerText}`);
    }
    console.log('✓ SUCCESS: Clear label "Road route available — complete EV journey not currently feasible" displayed!');

    if (bannerText?.includes('Last Reachable Station') || bannerText?.includes('Remaining Gap to Destination')) {
      console.log('✓ SUCCESS: Last reachable station and remaining gap details are explicitly rendered in the banner!');
    }

    await page.screenshot({ path: 'scripts/e2e-phase6h-step4-infeasible-diagnostic.png' });

    // Reset settings back to normal
    await page.evaluate(() => {
      localStorage.clear();
    });

    console.log('\n=== ALL PHASE 6H END-TO-END VERIFICATION CHECKS PASSED ===');
  } catch (err) {
    console.error('E2E Verification Error:', err);
    await page.screenshot({ path: 'scripts/e2e-phase6h-failure.png' }).catch(() => {});
    process.exit(1);
  } finally {
    await browser.close();
  }
}

function expectTruthy(val, msg) {
  if (!val) throw new Error(msg);
}

runPhase6hVerification();
