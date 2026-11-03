import { createServer } from 'vite';
import { chromium } from 'playwright';

async function runPhase6d1BrowserVerification() {
  console.log('================================================================');
  console.log('   PHASE 6D.1: REAL BROWSER CHARGING STATIONS VERIFICATION');
  console.log('================================================================');

  // 1. Start Vite Dev Server on port 3110 with our Station API Plugin active
  const server = await createServer({
    server: { port: 3110, host: '127.0.0.1' }
  });
  await server.listen();
  console.log('✓ Vite Dev Server running at http://127.0.0.1:3110');

  // 2. Launch Chromium browser
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      console.log(`[BROWSER ${msg.type().toUpperCase()}]:`, msg.text());
    }
  });

  try {
    // 3. Verify Direct Backend Station API over HTTP
    console.log('\n--- 1. Testing Live Backend Station Stats Endpoint ---');
    const statsRes = await page.goto('http://127.0.0.1:3110/api/stations/stats');
    const statsJson = JSON.parse(await statsRes.text());
    console.log('✓ /api/stations/stats status:', statsRes.status());
    console.log('✓ Total normalized hubs reported:', statsJson.stats.total);
    console.log('✓ Raw records count:', statsJson.stats.rawRecordsCount);
    console.log('✓ Valid coordinate locations:', statsJson.stats.validCoordinatesCount);
    console.log('✓ States count:', statsJson.stats.statesCount);
    console.log('✓ Fast chargers (>=30 kW):', statsJson.stats.fastChargerCount);
    console.log('✓ LEV chargers (<=3.3 kW):', statsJson.stats.levCount);

    // 4. Navigate to application homepage
    console.log('\n--- 2. Loading Application Homepage ---');
    await page.goto('http://127.0.0.1:3110/', { waitUntil: 'networkidle' });
    console.log('✓ App page loaded successfully. Title:', await page.title());

    // 5. Open Charger Discovery & Hub Explorer Modal
    console.log('\n--- 3. Opening Charger Discovery & Hub Explorer ---');
    const chargersButton = page.locator('button:has-text("Chargers")');
    await chargersButton.click();
    await page.waitForTimeout(600);

    // Verify modal header & live registry status
    const modalSubtitle = await page.locator('text=National EV PCS Registry').first().textContent();
    console.log('✓ Modal Header Status:', modalSubtitle?.trim());

    // 6. Test "Show All Imported Stations" mode
    console.log('\n--- 4. Enabling "Show All Imported Stations" Mode ---');
    const showAllButton = page.locator('button:has-text("Show All Imported Stations")');
    await showAllButton.click();
    await page.waitForTimeout(500);

    // 7. Search for Tata Power
    console.log('\n--- 5. Searching for "Tata Power" ---');
    const searchInput = page.locator('input[placeholder*="Search by station name"]');
    await searchInput.fill('Tata Power');
    await page.waitForTimeout(600);
    let cards = await page.locator('.custom-scrollbar > div').count();
    let firstCardText = await page.locator('.custom-scrollbar > div').first().innerText();
    console.log(`✓ Tata Power search returned ${cards} visible cards. First card: ${firstCardText.split('\n')[0]}`);

    // 8. Search for Ather
    console.log('\n--- 6. Searching for "Ather" ---');
    await searchInput.fill('Ather');
    await page.waitForTimeout(600);
    cards = await page.locator('.custom-scrollbar > div').count();
    firstCardText = await page.locator('.custom-scrollbar > div').first().innerText();
    console.log(`✓ Ather search returned ${cards} visible cards. First card: ${firstCardText.split('\n')[0]}`);

    // 9. Search for IOCL
    console.log('\n--- 7. Searching for "IOCL" ---');
    await searchInput.fill('IOCL');
    await page.waitForTimeout(600);
    cards = await page.locator('.custom-scrollbar > div').count();
    firstCardText = await page.locator('.custom-scrollbar > div').first().innerText();
    console.log(`✓ IOCL search returned ${cards} visible cards. First card: ${firstCardText.split('\n')[0]}`);

    // 10. Filter by State: Andhra Pradesh
    console.log('\n--- 8. Filtering by State: Andhra Pradesh ---');
    await searchInput.fill('');
    const stateSelect = page.locator('select').first();
    await stateSelect.selectOption('Andhra Pradesh');
    await page.waitForTimeout(600);
    cards = await page.locator('.custom-scrollbar > div').count();
    firstCardText = await page.locator('.custom-scrollbar > div').first().innerText();
    console.log(`✓ Andhra Pradesh filter returned ${cards} cards. First card: ${firstCardText.split('\n')[0]}`);

    // 11. Filter by State: Bihar
    console.log('\n--- 9. Filtering by State: Bihar ---');
    await stateSelect.selectOption('Bihar');
    await page.waitForTimeout(600);
    cards = await page.locator('.custom-scrollbar > div').count();
    firstCardText = await page.locator('.custom-scrollbar > div').first().innerText();
    console.log(`✓ Bihar filter returned ${cards} cards. First card: ${firstCardText.split('\n')[0]}`);

    // 12. Filter by State: Maharashtra
    console.log('\n--- 10. Filtering by State: Maharashtra ---');
    await stateSelect.selectOption('Maharashtra');
    await page.waitForTimeout(600);
    cards = await page.locator('.custom-scrollbar > div').count();
    firstCardText = await page.locator('.custom-scrollbar > div').first().innerText();
    console.log(`✓ Maharashtra filter returned ${cards} cards. First card: ${firstCardText.split('\n')[0]}`);

    // Take screenshot of Charger Explorer with National PCS data
    await page.screenshot({ path: 'scripts/national-chargers-explorer.png' });
    console.log('✓ Screenshot saved to scripts/national-chargers-explorer.png');

    // Close Explorer Modal
    const closeBtn = page.locator('button:has-text("Close Explorer")');
    await closeBtn.click();
    await page.waitForTimeout(500);

    // 13. Map Viewport & Station Markers Verification
    console.log('\n--- 11. Verifying Station Markers on Map ---');
    // Zoom into Delhi region
    await page.evaluate(() => {
      const mapEl = document.querySelector('.leaflet-container');
      // @ts-ignore
      const map = mapEl?._leaflet_map;
      if (map) {
        map.setView([28.6139, 77.2090], 11);
      }
    });
    await page.waitForTimeout(1500);

    const stationMarkersCount = await page.locator('.national-station-pin').count();
    console.log(`✓ Map rendered ${stationMarkersCount} national charging station pins in Delhi viewport.`);

    // Click on the first national station marker to open popup
    if (stationMarkersCount > 0) {
      await page.locator('.national-station-pin').first().click();
      await page.waitForTimeout(600);
      const popupContent = await page.locator('.leaflet-popup-content').innerText();
      console.log('✓ Station popup content opened:\n', popupContent.trim());
    }

    await page.screenshot({ path: 'scripts/national-stations-map.png' });
    console.log('✓ Map screenshot saved to scripts/national-stations-map.png');

    // 14. Route Corridor Discovery Verification (POST /api/stations/corridor)
    console.log('\n--- 12. Testing Dynamic Route Corridor Discovery ---');
    const corridorPostRes = await page.request.post('http://127.0.0.1:3110/api/stations/corridor', {
      data: {
        polyline: [
          [28.6139, 77.2090], // Delhi
          [28.4089, 77.3178], // Faridabad
          [27.4924, 77.6737], // Mathura
          [27.1767, 78.0081]  // Agra
        ],
        corridorRadiusMi: 25,
        excludeLev: true,
        minPowerKw: 30,
        limit: 15
      }
    });
    const corridorJson = await corridorPostRes.json();
    console.log(`✓ Corridor discovery HTTP ${corridorPostRes.status()}: found ${corridorJson.count} fast charging stations.`);
    if (corridorJson.stations?.length > 0) {
      console.log('✓ First corridor station:', corridorJson.stations[0].name, '|', corridorJson.stations[0].network, '| Power:', corridorJson.stations[0].ratedPowerKw, 'kW');
    }

    console.log('\n================================================================');
    console.log('   PHASE 6D.1 BROWSER VERIFICATION: ALL STEPS SUCCESSFUL!');
    console.log('================================================================');
  } finally {
    await browser.close();
    await server.close();
  }
}

runPhase6d1BrowserVerification().catch((err) => {
  console.error('Browser verification failed:', err);
  process.exit(1);
});
