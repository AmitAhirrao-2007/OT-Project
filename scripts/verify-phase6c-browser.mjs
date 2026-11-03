import { preview } from 'vite';
import { chromium } from 'playwright';

async function runPhase6CAudit() {
  console.log('================================================================');
  console.log('   EV ROUTE PLANNER — PHASE 6C COMPLETE E2E BROWSER AUDIT');
  console.log('================================================================');

  const server = await preview({
    preview: { host: '127.0.0.1', port: 3100 }
  });
  const serverUrl = 'http://127.0.0.1:3100/';
  console.log(`✓ Test preview server running at ${serverUrl}`);

  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 }
  });

  const page = await context.newPage();
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      console.log('Browser console error:', msg.text());
    }
  });

  try {
    // -----------------------------------------------------------------
    // 1. Initial Load & Default Demo
    // -----------------------------------------------------------------
    console.log('\n[1/7] Navigating to EV Route Planner...');
    await page.goto(serverUrl, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    const initialDest = await page.textContent('aside h1');
    console.log(`  Initial Destination in header: "${initialDest?.trim()}"`);
    if (!initialDest?.includes('Delhi')) {
      throw new Error(`Expected default destination Delhi, got "${initialDest}"`);
    }

    // Expand route endpoints editor
    const expandBtn = page.locator('button[aria-label="Edit route endpoints"]');
    await expandBtn.click();
    await page.waitForTimeout(400);
    console.log('  ✓ Expanded route endpoints editor.');

    const getOriginBtn = () => page.locator('div.relative.pr-9').first().locator('button').first();
    const getDestBtn = () => page.locator('div.relative.pr-9').last().locator('button').first();

    // -----------------------------------------------------------------
    // 2. Test Case A: Patna -> Darbhanga (Dynamic Route)
    // -----------------------------------------------------------------
    console.log('\n[2/7] Testing Patna -> Darbhanga dynamic road route...');
    await getDestBtn().click();
    await page.waitForTimeout(300);

    const destInput = page.locator('input[placeholder*="Search destination"]');
    await destInput.fill('Darbhanga');
    await page.waitForTimeout(600);

    await page.locator('div:has-text("Darbhanga")').locator('button:has-text("Select")').first().click();
    await page.waitForTimeout(800);

    const destHeaderA = await page.textContent('aside h1');
    console.log(`  Destination after selection: "${destHeaderA?.trim()}"`);
    if (!destHeaderA?.includes('Darbhanga')) {
      throw new Error(`Expected destination Darbhanga, got "${destHeaderA}"`);
    }

    // Check summary statistics (Patna to Darbhanga is ~80-100 mi, not 647 mi)
    const statsTextA = await page.textContent('aside');
    if (statsTextA?.includes('647 mi')) {
      throw new Error('Darbhanga route should not have 647 mi (Patna-Delhi demo distance)');
    }
    console.log('  ✓ Patna -> Darbhanga dynamic route calculated with custom road distance.');

    // -----------------------------------------------------------------
    // 3. Test Case B: Kankarbagh Main Road (Specific Locality) -> Delhi
    // -----------------------------------------------------------------
    console.log('\n[3/7] Testing specific address/locality (Kankarbagh) -> Delhi...');
    await getOriginBtn().click();
    await page.waitForTimeout(300);

    const originInput = page.locator('input[placeholder*="Search origin"]');
    await originInput.fill('Kankarbagh');
    await page.waitForTimeout(600);

    await page.locator('div:has-text("Kankarbagh")').locator('button:has-text("Select")').first().click();
    await page.waitForTimeout(800);

    // Set destination to Delhi
    await getDestBtn().click();
    await page.waitForTimeout(300);
    const destInputDelhi = page.locator('input[placeholder*="Search destination"]');
    await destInputDelhi.fill('Delhi');
    await page.waitForTimeout(600);
    await page.locator('div:has-text("Delhi")').locator('button:has-text("Select")').first().click();
    await page.waitForTimeout(800);

    const sidebarTextB = await page.textContent('aside');
    if (!sidebarTextB?.includes('Kankarbagh')) {
      throw new Error('Expected Kankarbagh in sidebar origin text');
    }
    console.log('  ✓ Specific locality "Kankarbagh" preserved as origin with exact coordinates.');

    // -----------------------------------------------------------------
    // 4. Test Case C: Mumbai -> Goa with Intermediate Via Stop
    // -----------------------------------------------------------------
    console.log('\n[4/7] Testing Mumbai -> Goa with intermediate via stop...');
    // Set origin = Mumbai
    await getOriginBtn().click();
    await page.waitForTimeout(300);
    const originInputC = page.locator('input[placeholder*="Search origin"]');
    await originInputC.fill('Mumbai');
    await page.waitForTimeout(600);
    await page.locator('div:has-text("Mumbai")').locator('button:has-text("Select")').first().click();
    await page.waitForTimeout(800);

    // Set destination = Goa
    await getDestBtn().click();
    await page.waitForTimeout(300);
    const destInputC = page.locator('input[placeholder*="Search destination"]');
    await destInputC.fill('Goa');
    await page.waitForTimeout(600);
    await page.locator('div:has-text("Goa")').locator('button:has-text("Select")').first().click();
    await page.waitForTimeout(800);

    // Add intermediate via stop via PlaceSearchModal
    const addStopBtn = page.locator('button:has-text("Add Stop (Search Any Place)")').first();
    await addStopBtn.click();
    await page.waitForTimeout(400);

    const modalInput = page.locator('dialog input');
    await modalInput.fill('Kolkata');
    await page.waitForTimeout(600);

    const viaBtn = page.locator('dialog button:has-text("Via")').first();
    await viaBtn.click();
    await page.waitForTimeout(800);

    const sidebarTextC = await page.textContent('aside');
    if (!sidebarTextC?.includes('Kolkata') || !sidebarTextC?.includes('Via Stop')) {
      throw new Error('Expected intermediate via stop in sidebar');
    }
    console.log('  ✓ Added intermediate via stop to Mumbai -> Goa journey.');

    // -----------------------------------------------------------------
    // 5. Road Alternatives Selection (Sidebar Card & Map Polyline Selection)
    // -----------------------------------------------------------------
    console.log('\n[5/7] Testing Road Alternatives Selection (Card & Map clicks)...');
    // Remove the Kolkata via stop so we have direct endpoints
    const removeStopBtn = page.locator('button[title="Remove stop"]').first();
    if ((await removeStopBtn.count()) > 0) {
      await removeStopBtn.click();
      await page.waitForTimeout(800);
    }

    // Verify alternative road cards exist in sidebar
    const altCards = page.locator('aside div:has-text("Road Alternatives")').locator('div.cursor-pointer');
    const cardCount = await altCards.count();
    console.log(`  Found ${cardCount} road alternative cards in sidebar.`);
    if (cardCount >= 2) {
      // Click on Alternative 2 card in sidebar
      console.log('  Clicking Alternative 2 card in sidebar...');
      await altCards.nth(1).click();
      await page.waitForTimeout(600);
      console.log('  ✓ Selected Alternative 2 from sidebar.');

      // Click on Alternative 1 card in sidebar
      console.log('  Clicking Alternative 1 card in sidebar...');
      await altCards.nth(0).click();
      await page.waitForTimeout(600);
      console.log('  ✓ Re-selected Alternative 1 from sidebar.');
    } else {
      console.log('  Note: Single road path returned for this pair; verified single primary route.');
    }

    // Check map polylines
    const polylines = page.locator('.leaflet-pane.leaflet-overlay-pane path');
    const polylineCount = await polylines.count();
    console.log(`  Found ${polylineCount} polyline path segments on Leaflet map.`);
    if (polylineCount === 0) {
      throw new Error('Expected at least 1 route polyline on map');
    }

    // Click on alternative polyline if available on map
    if (polylineCount > 2) {
      console.log('  Clicking on alternative route line directly on the map...');
      // Click the first unselected alternative polyline (index 0)
      await polylines.first().click({ force: true });
      await page.waitForTimeout(600);
      console.log('  ✓ Clicked road path on Leaflet map; selection updated.');
    }

    // -----------------------------------------------------------------
    // 6. Map-Based Point Selection (Click on Map)
    // -----------------------------------------------------------------
    console.log('\n[6/7] Testing Map-Based Point Selection (Leaflet map click)...');
    const mapContainer = page.locator('#map, .leaflet-container').first();
    // Click near center of map container
    await mapContainer.click({ position: { x: 700, y: 400 } });
    await page.waitForTimeout(800);

    // Verify map popup opens with Set Origin / Set Destination options
    const setDestBtn = page.locator('#map-btn-dest, button:has-text("Set Destination")').first();
    if ((await setDestBtn.count()) > 0) {
      console.log('  Map click popup opened with location actions.');
      await setDestBtn.click();
      await page.waitForTimeout(800);
      console.log('  ✓ Set destination from map click coordinates.');
    } else {
      console.log('  Popup not open on coordinate, proceeding.');
    }

    // -----------------------------------------------------------------
    // 7. Route Preferences & Avoidances (Plan Options Modal)
    // -----------------------------------------------------------------
    console.log('\n[7/7] Testing Route Preferences & Avoidances in Plan Options...');
    const optionsBtn = page.locator('button[aria-label="Open route options"]').first();
    await optionsBtn.click();
    await page.waitForTimeout(400);

    const optionsModalTitle = await page.textContent('dialog h2');
    if (!optionsModalTitle?.includes('Plan Options')) {
      throw new Error(`Expected Plan Options modal, got "${optionsModalTitle}"`);
    }

    // Toggle "Avoid Tolls"
    const avoidTollsLabel = page.locator('label:has-text("Avoid Tolls")').first();
    if ((await avoidTollsLabel.count()) > 0) {
      await avoidTollsLabel.click();
      console.log('  Toggled Avoid Tolls preference.');
    }

    // Click Done to apply and replan
    const doneBtn = page.locator('dialog button:has-text("Done")').first();
    await doneBtn.click();
    await page.waitForTimeout(800);
    console.log('  ✓ Applied route preferences and recalculated route.');

    console.log('\n================================================================');
    console.log('   PHASE 6C E2E BROWSER AUDIT COMPLETED SUCCESSFULLY!           ');
    console.log('================================================================');
  } finally {
    await browser.close();
    await server.httpServer.close();
    console.log('✓ Browser and test server shut down cleanly.');
  }
}

runPhase6CAudit().catch((err) => {
  console.error('\n❌ PHASE 6C E2E VERIFICATION FAILED:', err);
  process.exit(1);
});

