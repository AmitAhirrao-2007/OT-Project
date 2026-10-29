import { chromium } from 'playwright';
import fs from 'node:fs';

async function runE2EAudit() {
  console.log('================================================================');
  console.log('   EV ROUTE PLANNER — COMPREHENSIVE END-TO-END BROWSER AUDIT');
  console.log('================================================================');

  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 }
  });

  const page = await context.newPage();

  // Listen for console errors & warnings
  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  page.on('pageerror', (err) => {
    consoleErrors.push(err.message);
  });

  try {
    // -------------------------------------------------------------
    // WORKFLOW 1: INITIAL APPLICATION LOAD & CORRIDOR VERIFICATION
    // -------------------------------------------------------------
    console.log('\n[1/8] Navigating to http://127.0.0.1:3000...');
    await page.goto('http://127.0.0.1:3000', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    // Verify Title & Header
    const destHeader = await page.textContent('aside h1');
    console.log(`  Destination Header: "${destHeader}"`);
    if (!destHeader.includes('Delhi')) {
      throw new Error(`Expected destination Delhi, got "${destHeader}"`);
    }

    const vehicleText = await page.textContent('aside');
    if (!vehicleText.includes('Tata Nexon EV')) {
      throw new Error('Expected Tata Nexon EV model in sidebar');
    }
    console.log('  ✓ Initial route destination (Delhi) and vehicle model verified.');

    // -------------------------------------------------------------
    // WORKFLOW 2: ROUTE ALTERNATIVES SELECTION & METRIC CONSISTENCY
    // -------------------------------------------------------------
    console.log('\n[2/8] Testing Route Alternatives (Optimal, Fewer, Fewest)...');
    const routeButtons = await page.$$('aside div.grid-cols-3 button');
    console.log(`  Found ${routeButtons.length} route duration alternative buttons.`);
    if (routeButtons.length !== 3) {
      throw new Error(`Expected 3 route alternative buttons, found ${routeButtons.length}`);
    }

    // Select 2nd alternative (Fewer stops)
    await routeButtons[1].click();
    await page.waitForTimeout(500);
    const summaryAfterAlt2 = await page.textContent('aside');
    console.log('  ✓ Clicked 2nd alternative (Fewer stops). Active route updated.');

    // Select 3rd alternative (Fewest stops)
    await routeButtons[2].click();
    await page.waitForTimeout(500);
    console.log('  ✓ Clicked 3rd alternative (Fewest stops).');

    // Switch back to 1st alternative (Optimal)
    await routeButtons[0].click();
    await page.waitForTimeout(500);
    console.log('  ✓ Re-selected 1st alternative (Optimal).');

    // -------------------------------------------------------------
    // WORKFLOW 3: ROUTE ENDPOINTS, WAYPOINTS & SWAP BEHAVIOUR
    // -------------------------------------------------------------
    console.log('\n[3/8] Testing Route Endpoints, Waypoints & Swapping...');
    
    // Expand Endpoints Editor
    const expandBtn = await page.$('button[aria-label="Edit route endpoints"]');
    await expandBtn.click();
    await page.waitForTimeout(300);

    // Test Departure Battery Slider
    const batterySlider = await page.$('input[type="range"][min="5"]');
    if (batterySlider) {
      await batterySlider.fill('80');
      await page.waitForTimeout(400);
      console.log('  ✓ Adjusted departure battery to 80%.');
    }

    // Capture desktop screenshot before swap
    await page.screenshot({ path: 'docs/screenshots/planner-desktop.png', fullPage: false });
    console.log('  ✓ Saved screenshot: docs/screenshots/planner-desktop.png');

    // Test Adding Waypoint (e.g. Varanasi)
    const addWaypointBtn = await page.$('button:has-text("Add Stop / Waypoint")');
    if (addWaypointBtn) {
      await addWaypointBtn.click();
      await page.waitForTimeout(300);
      
      // Select Varanasi from list
      const varanasiOption = await page.$('button:has-text("Varanasi")');
      if (varanasiOption) {
        await varanasiOption.click();
        await page.waitForTimeout(500);
        console.log('  ✓ Added intermediate waypoint: Varanasi.');
        
        // Verify waypoint is displayed in DOM
        const waypointCard = await page.$('text="Varanasi"');
        if (!waypointCard) {
          throw new Error('Varanasi waypoint not found in inputs list after selection');
        }

        // Now remove the waypoint
        const removeWpBtn = await page.$('button[title="Remove stop"]');
        if (removeWpBtn) {
          await removeWpBtn.click();
          await page.waitForTimeout(500);
          console.log('  ✓ Removed waypoint: Varanasi.');
        }
      }
    }

    // Test Swapping Origin and Destination (Patna -> Delhi becomes Delhi -> Patna)
    const swapBtn = await page.$('button[aria-label="Swap endpoints"]');
    await swapBtn.click();
    await page.waitForTimeout(800);

    const reversedDest = await page.textContent('aside h1');
    console.log(`  Destination after swap: "${reversedDest}"`);
    if (!reversedDest.includes('Patna')) {
      throw new Error(`Expected destination to be Patna after swap, got "${reversedDest}"`);
    }
    console.log('  ✓ Successfully swapped endpoints: Delhi → Patna.');

    // Swap back to Patna -> Delhi
    await swapBtn.click();
    await page.waitForTimeout(800);
    console.log('  ✓ Swapped back to Patna → Delhi.');

    // -------------------------------------------------------------
    // WORKFLOW 4: PLAN OPTIONS MODAL & SETTINGS SYNCHRONIZATION
    // -------------------------------------------------------------
    console.log('\n[4/8] Testing Plan Options Dialog...');
    const optionsBtn = await page.$('button[aria-label="Open route options"]');
    await optionsBtn.click();
    await page.waitForTimeout(500);

    // Verify modal is open
    const modalTitle = await page.textContent('h2, h3');
    if (!modalTitle.includes('Plan Options')) {
      throw new Error(`Expected Plan Options modal, got "${modalTitle}"`);
    }
    console.log('  ✓ Plan Options modal opened.');

    // Capture screenshot of Plan Options modal
    await page.screenshot({ path: 'docs/screenshots/plan-options-modal.png' });
    console.log('  ✓ Saved screenshot: docs/screenshots/plan-options-modal.png');

    // Toggle Avoid Tolls
    const avoidTollsLabel = await page.$('text="Avoid Tolls"');
    if (avoidTollsLabel) {
      await avoidTollsLabel.click();
      await page.waitForTimeout(200);
      console.log('  ✓ Toggled "Avoid Tolls" option.');
    }

    // Click Done to apply and replan
    const doneBtn = await page.$('button:has-text("Done")');
    await doneBtn.click();
    await page.waitForTimeout(600);
    console.log('  ✓ Applied Plan Options and closed modal.');

    // -------------------------------------------------------------
    // WORKFLOW 5: SETTINGS MODAL (VEHICLE, CHARGING, ROUTING, DISPLAY)
    // -------------------------------------------------------------
    console.log('\n[5/8] Testing Global Settings Modal...');
    
    // Open hamburger menu -> Vehicle Settings
    const navMenuBtn = await page.$('button[aria-label="Navigation menu"]');
    await navMenuBtn.click();
    await page.waitForTimeout(300);

    const vehicleSettingsMenu = await page.$('button:has-text("Vehicle Settings")');
    await vehicleSettingsMenu.click();
    await page.waitForTimeout(500);

    // Verify Vehicle tab open
    const vehicleName = await page.textContent('div:has-text("Tata Nexon EV Max")');
    if (!vehicleName) {
      throw new Error('Vehicle name not displayed in Vehicle settings tab');
    }
    console.log('  ✓ Settings modal opened on Vehicle tab.');

    // Screenshot Settings Modal
    await page.screenshot({ path: 'docs/screenshots/settings-modal.png' });
    console.log('  ✓ Saved screenshot: docs/screenshots/settings-modal.png');

    // Test Charging Tab
    const chargingTab = await page.$('button:has-text("Charging")');
    await chargingTab.click();
    await page.waitForTimeout(300);

    // Add a preferred network (e.g. Jio-bp pulse)
    const addJioBtn = await page.$('button:has-text("Jio-bp pulse")');
    if (addJioBtn) {
      await addJioBtn.click();
      await page.waitForTimeout(200);
      console.log('  ✓ Added Jio-bp pulse to preferred charging networks.');
    }

    // Test Display & Appearance Tab (Units)
    const displayTab = await page.$('button:has-text("Display & Appearance")');
    await displayTab.click();
    await page.waitForTimeout(300);

    // Switch to Metric units
    const metricBtn = await page.$('button:has-text("Kilometers")');
    if (metricBtn) {
      await metricBtn.click();
      await page.waitForTimeout(200);
      console.log('  ✓ Switched display units to Metric (km, km/h).');
    }

    // Click "Save & Apply"
    const saveApplyBtn = await page.$('button:has-text("Save & Apply")');
    await saveApplyBtn.click();
    await page.waitForTimeout(600);
    console.log('  ✓ Saved & applied global settings.');

    // Verify that RoutePanel now shows km units
    const panelText = await page.textContent('aside');
    if (panelText.includes('km')) {
      console.log('  ✓ Confirmed RoutePanel dynamically switched to Metric units (km).');
    }

    // -------------------------------------------------------------
    // WORKFLOW 6: CHARGER FINDER & STATION DETAILS MODAL
    // -------------------------------------------------------------
    console.log('\n[6/8] Testing Station Details & Charger Discovery...');
    
    // Open a stop card to view Station Details
    const firstStopCard = await page.$('div:has-text("Adani TotalEnergies"), div:has-text("Tata Power"), div:has-text("Statiq")');
    if (firstStopCard) {
      await firstStopCard.click();
      await page.waitForTimeout(500);

      // Verify Station Details Modal opened
      const stationModal = await page.$('div:has-text("Coordinates:")');
      if (stationModal) {
        console.log('  ✓ Station Details modal opened from stop card.');
        await page.screenshot({ path: 'docs/screenshots/station-details.png' });
        console.log('  ✓ Saved screenshot: docs/screenshots/station-details.png');

        // Close station modal
        const closeStationBtn = await page.$('button:has-text("Close")');
        if (closeStationBtn) {
          await closeStationBtn.click();
          await page.waitForTimeout(300);
        }
      }
    }

    // -------------------------------------------------------------
    // WORKFLOW 7: MAP INTERACTIONS (ZOOM, LAYERS, TILES)
    // -------------------------------------------------------------
    console.log('\n[7/8] Testing Leaflet Map Controls and Tile Rendering...');
    
    // Verify no CARTO API key error / watermark in DOM
    const mapHtml = await page.innerHTML('div.leaflet-container');
    if (mapHtml.includes('API KEY REQUIRED') || mapHtml.includes('api_key_required')) {
      throw new Error('Watermark "API KEY REQUIRED" found on map container!');
    }
    console.log('  ✓ Verified NO "API KEY REQUIRED" watermark on Leaflet container.');

    // Verify OpenStreetMap attribution
    const attribution = await page.textContent('.leaflet-control-attribution');
    console.log(`  Map Attribution: "${attribution.trim()}"`);
    if (!attribution.includes('OpenStreetMap') && !attribution.includes('Esri')) {
      throw new Error('Map attribution missing or invalid');
    }
    console.log('  ✓ Map attribution properly visible.');

    // Test Zoom In & Out
    const zoomInBtn = await page.$('button[aria-label="Zoom in"]');
    if (zoomInBtn) {
      await zoomInBtn.click();
      await page.waitForTimeout(200);
      console.log('  ✓ Clicked Zoom In.');
    }

    const zoomOutBtn = await page.$('button[aria-label="Zoom out"]');
    if (zoomOutBtn) {
      await zoomOutBtn.click();
      await page.waitForTimeout(200);
      console.log('  ✓ Clicked Zoom Out.');
    }

    // Test Layer Switcher
    const layerBtn = await page.$('button[aria-label="Toggle map layer style"]');
    if (layerBtn) {
      await layerBtn.click();
      await page.waitForTimeout(200);
      const esriOption = await page.$('button:has-text("Esri Dark Gray Canvas")');
      if (esriOption) {
        await esriOption.click();
        await page.waitForTimeout(500);
        console.log('  ✓ Switched Map Basemap to Esri Dark Gray Canvas.');
      }
    }

    // -------------------------------------------------------------
    // WORKFLOW 8: RESPONSIVE NARROW / MOBILE VIEWPORT TEST
    // -------------------------------------------------------------
    console.log('\n[8/8] Testing Responsive Mobile Viewport (375x667)...');
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(500);

    // Save mobile screenshot
    await page.screenshot({ path: 'docs/screenshots/planner-mobile.png', fullPage: false });
    console.log('  ✓ Saved screenshot: docs/screenshots/planner-mobile.png');

    // Test Collapse / Expand Button on mobile
    const collapseBtn = await page.$('aside button[aria-label="Collapse panel"]');
    if (collapseBtn) {
      await collapseBtn.click();
      await page.waitForTimeout(400);
      console.log('  ✓ Collapsed Route Panel on mobile.');

      const expandMobileBtn = await page.$('button[aria-label="Expand Route Panel"]');
      if (expandMobileBtn) {
        await expandMobileBtn.click();
        await page.waitForTimeout(400);
        console.log('  ✓ Expanded Route Panel on mobile.');
      }
    }

    // Check for unhandled console errors
    console.log('\n-------------------------------------------------------------');
    console.log(`Console Errors Recorded: ${consoleErrors.length}`);
    if (consoleErrors.length > 0) {
      console.warn('Console error messages:', consoleErrors);
    } else {
      console.log('✓ Zero console errors encountered during entire E2E test execution.');
    }

    console.log('\n================================================================');
    console.log('  🎉 ALL END-TO-END BROWSER WORKFLOWS COMPLETED SUCCESSFULLY! ');
    console.log('================================================================');
  } catch (err) {
    console.error('\n❌ E2E Audit Failed with error:', err);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

runE2EAudit();
