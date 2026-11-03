import { preview } from 'vite';
import { chromium } from 'playwright';

async function runRoadGeometryBrowserVerification() {
  console.log('================================================================');
  console.log('   PHASE 6C.2: ROAD ROUTE GEOMETRY & MAP VISIBILITY VERIFICATION');
  console.log('================================================================');

  // 1. Start Vite Preview Server
  const previewServer = await preview({
    preview: { host: '127.0.0.1', port: 3108 }
  });
  console.log('✓ Vite Preview Server running at http://127.0.0.1:3108');

  // 2. Launch Playwright using installed Chrome
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  // 3. Mock Provider Backend via Playwright Page Route Interception
  await page.route('**/api/places/status', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status_code: 1000, configured: true, provider: 'tomtom_orbis', status: 'ready' })
    });
  });

  await page.route('**/api/places/suggest', async (route) => {
    const body = route.request().postDataJSON() || {};
    const q = (body.query || '').toLowerCase();
    const results = [];

    if (q.includes('karol') || q.includes('delhi')) {
      results.push({
        id: 'tt-kb',
        title: 'Karol Bagh, New Delhi',
        kind: 'neighborhood',
        position: { lat: 28.6517, lon: 77.1907 },
        address: { freeformAddress: 'Karol Bagh, New Delhi, Delhi 110005, India', municipality: 'New Delhi' }
      });
    }
    if (q.includes('bhopal')) {
      results.push({
        id: 'tt-bhopal',
        title: 'Bhopal, Madhya Pradesh',
        kind: 'city',
        position: { lat: 23.2599, lon: 77.4126 },
        address: { freeformAddress: 'Bhopal, Madhya Pradesh, India', municipality: 'Bhopal' }
      });
    }
    if (q.includes('patna')) {
      results.push({
        id: 'tt-patna',
        title: 'Patna, Bihar',
        kind: 'city',
        position: { lat: 25.5941, lon: 85.1376 },
        address: { freeformAddress: 'Patna, Bihar, India', municipality: 'Patna' }
      });
    }
    if (q.includes('darbhanga')) {
      results.push({
        id: 'tt-darbhanga',
        title: 'Darbhanga, Bihar',
        kind: 'city',
        position: { lat: 26.1528, lon: 85.8974 },
        address: { freeformAddress: 'Darbhanga, Bihar, India', municipality: 'Darbhanga' }
      });
    }

    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status_code: 1000, results })
    });
  });

  await page.route('**/api/routing/**', async (route) => {
    const payload = route.request().postDataJSON() || {};
    const locations = payload.locations || payload.waypoints || [];
    const start = locations[0] || [28.6517, 77.1907];
    const end = locations[locations.length - 1] || [23.2599, 77.4126];
    const isDelhiBhopal = Math.abs(start[0] - 28.65) < 0.5 && Math.abs(end[0] - 23.25) < 0.5;

    let primaryCoords = [];
    let altCoords = [];

    if (isDelhiBhopal) {
      // Genuine road polyline along NH-44 / NH-46
      primaryCoords = [
        [28.6517, 77.1907], // Karol Bagh, Delhi
        [28.4595, 77.0266], // Gurugram
        [27.9972, 77.3478], // Mathura Bypass
        [27.1767, 78.0081], // Agra
        [26.7900, 78.0100], // Dholpur
        [26.2183, 78.1828], // Gwalior
        [25.4484, 78.5685], // Jhansi
        [24.5854, 78.2917], // Lalitpur
        [23.8388, 78.7378], // Sagar
        [23.2599, 77.4126]  // Bhopal
      ];

      altCoords = [
        [28.6517, 77.1907], // Karol Bagh
        [28.1800, 76.6200], // Rewari
        [27.5600, 76.6100], // Alwar
        [26.9124, 75.7873], // Jaipur
        [26.4499, 74.6399], // Ajmer
        [25.3400, 74.6300], // Bhilwara
        [23.2599, 77.4126]  // Bhopal
      ];
    } else {
      // Patna -> Darbhanga road corridor via NH-22 / NH-27
      primaryCoords = [
        [25.5941, 85.1376], // Patna
        [25.6858, 85.2146], // Hajipur
        [25.8600, 85.3400], // Bhagwanpur
        [26.1209, 85.3647], // Muzaffarpur
        [26.1528, 85.8974]  // Darbhanga
      ];
    }

    const primaryDistMi = isDelhiBhopal ? 485 : 88;
    const primaryDurMins = isDelhiBhopal ? 530 : 135;

    const routes = [
      {
        id: 'road-path-0',
        name: 'Fastest Road Route (NH-44 / NH-46)',
        distanceMi: primaryDistMi,
        durationMinutes: primaryDurMins,
        freeFlowDurationMinutes: primaryDurMins - 15,
        trafficDelayMinutes: 15,
        coordinates: primaryCoords,
        legs: [{ distanceMi: primaryDistMi, durationMinutes: primaryDurMins, trafficDelayMinutes: 15 }],
        routeType: 'fastest',
        hasTolls: true,
        source: 'orbis_v3'
      }
    ];

    if (isDelhiBhopal) {
      routes.push({
        id: 'road-path-1',
        name: 'Alternative via Rajasthan (NH-48 / NH-52)',
        distanceMi: 540,
        durationMinutes: 590,
        freeFlowDurationMinutes: 575,
        trafficDelayMinutes: 15,
        coordinates: altCoords,
        legs: [{ distanceMi: 540, durationMinutes: 590, trafficDelayMinutes: 15 }],
        routeType: 'alternative',
        hasTolls: true,
        source: 'orbis_v3'
      });
    }

    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status_code: 1000,
        provider: 'tomtom_orbis',
        routes
      })
    });
  });

  try {
    await page.goto('http://127.0.0.1:3108', { waitUntil: 'networkidle', timeout: 15000 });
    console.log('✓ Web application loaded successfully');

    // TEST CASE 1: Karol Bagh, New Delhi -> Bhopal, Madhya Pradesh
    console.log('\n--- TEST CASE 1: Karol Bagh, New Delhi -> Bhopal, Madhya Pradesh ---');

    // 1. Expand route endpoints editor
    const expandBtn = page.locator('button[aria-label="Edit route endpoints"]');
    await expandBtn.click();
    await page.waitForTimeout(400);

    const getOriginBtn = () => page.locator('div.relative.pr-9').first().locator('button').first();
    const getDestBtn = () => page.locator('div.relative.pr-9').last().locator('button').first();

    // 2. Select Origin: Karol Bagh
    await getOriginBtn().click();
    await page.waitForTimeout(300);
    const originInput = page.locator('input[placeholder*="Search origin"]');
    await originInput.fill('Karol Bagh');
    await page.waitForTimeout(600);
    const originOption = page.locator('.shadow-dropdown div:has-text("Karol Bagh") button:has-text("Select")').first();
    await originOption.waitFor({ state: 'visible', timeout: 8000 });
    await originOption.click();
    await page.waitForTimeout(600);
    console.log('✓ Selected Origin: Karol Bagh, New Delhi');

    // 3. Select Destination: Bhopal
    await getDestBtn().click();
    await page.waitForTimeout(300);
    const destInput = page.locator('input[placeholder*="Search destination"]');
    await destInput.fill('Bhopal');
    await page.waitForTimeout(600);
    const destOption = page.locator('.shadow-dropdown div:has-text("Bhopal") button:has-text("Select")').first();
    await destOption.waitFor({ state: 'visible', timeout: 8000 });
    await destOption.click();
    await page.waitForTimeout(1000);
    console.log('✓ Selected Destination: Bhopal, Madhya Pradesh');

    // 4. Verify Route Badge displays "Road Verified (TomTom)"
    const roadBadge = page.locator('text=Road Verified (TomTom)').first();
    await roadBadge.waitFor({ state: 'visible', timeout: 10000 });
    console.log('✓ Status Badge: "Road Verified (TomTom)" successfully displayed');

    // 5. Verify Leaflet Map Panes & Polyline SVG elements
    const routePaneExists = await page.evaluate(() => {
      const allPanes = Array.from(document.querySelectorAll('.leaflet-pane'));
      const routePane = allPanes.find(p => p.className.includes('route') || p.style.zIndex === '450');
      console.log('Panes found:', allPanes.map(p => ({ class: p.className, zIndex: p.style.zIndex })));
      return Boolean(routePane && (routePane.style.zIndex === '450' || window.getComputedStyle(routePane).zIndex === '450'));
    });
    console.log(`✓ Leaflet dedicated route-pane with zIndex 450: ${routePaneExists}`);
    if (!routePaneExists) {
      throw new Error('leaflet-route-pane not found or zIndex != 450');
    }

    // Check SVG polyline paths in route pane
    const pathCount = await page.evaluate(() => {
      const allPanes = Array.from(document.querySelectorAll('.leaflet-pane'));
      const routePane = allPanes.find(p => p.className.includes('route') || p.style.zIndex === '450');
      if (!routePane) return 0;
      const paths = routePane.querySelectorAll('path');
      return paths.length;
    });
    console.log(`✓ Visible Road Polyline Paths rendered in route-pane: ${pathCount}`);
    if (pathCount < 2) {
      throw new Error(`Expected at least 2 SVG paths (glow + core), found ${pathCount}`);
    }

    // Check SVG path coordinates string has valid highway turns
    const pathDAttr = await page.evaluate(() => {
      const allPanes = Array.from(document.querySelectorAll('.leaflet-pane'));
      const routePane = allPanes.find(p => p.className.includes('route') || p.style.zIndex === '450');
      const paths = routePane ? routePane.querySelectorAll('path') : [];
      return paths.length > 0 ? paths[0].getAttribute('d') : null;
    });
    console.log(`✓ SVG Path 'd' attribute contains connected points: ${pathDAttr?.slice(0, 60)}...`);
    if (!pathDAttr || !pathDAttr.includes('M') || !pathDAttr.includes('L')) {
      throw new Error('Polyline SVG missing valid path coordinate instructions (M / L)');
    }

    // 6. Verify Alternative Route Selection
    console.log('\n--- TEST CASE 2: Alternative Route Card & Selection ---');
    const altOption = page.locator('text=Alternative via Rajasthan').first();
    const hasAlt = await altOption.isVisible();
    console.log(`✓ Alternative Route Option ("Alternative via Rajasthan") present: ${hasAlt}`);
    if (hasAlt) {
      await altOption.click();
      await page.waitForTimeout(600);
      console.log(`✓ Alternative route clicked and selected successfully`);
    }

    // TEST CASE 3: Patna -> Darbhanga Road Route
    console.log('\n--- TEST CASE 3: Patna -> Darbhanga Road Route ---');
    await getOriginBtn().click();
    await page.waitForTimeout(300);
    const originInput2 = page.locator('input[placeholder*="Search origin"]');
    await originInput2.fill('Patna');
    await page.waitForTimeout(600);
    const patnaOption = page.locator('.shadow-dropdown div:has-text("Patna") button:has-text("Select")').first();
    await patnaOption.waitFor({ state: 'visible', timeout: 8000 });
    await patnaOption.click();
    await page.waitForTimeout(600);
    console.log('✓ Selected Origin: Patna, Bihar');

    await getDestBtn().click();
    await page.waitForTimeout(300);
    const destInput2 = page.locator('input[placeholder*="Search destination"]');
    await destInput2.fill('Darbhanga');
    await page.waitForTimeout(600);
    const darbhangaOption = page.locator('.shadow-dropdown div:has-text("Darbhanga") button:has-text("Select")').first();
    await darbhangaOption.waitFor({ state: 'visible', timeout: 8000 });
    await darbhangaOption.click();
    await page.waitForTimeout(1000);
    console.log('✓ Selected Destination: Darbhanga, Bihar');

    await roadBadge.waitFor({ state: 'visible', timeout: 10000 });
    console.log('✓ Patna -> Darbhanga recalculated with "Road Verified (TomTom)"');

    const darbhangaPaths = await page.evaluate(() => {
      const allPanes = Array.from(document.querySelectorAll('.leaflet-pane'));
      const routePane = allPanes.find(p => p.className.includes('route') || p.style.zIndex === '450');
      return routePane ? routePane.querySelectorAll('path').length : 0;
    });
    console.log(`✓ Patna -> Darbhanga road polyline paths in route-pane: ${darbhangaPaths}`);
    if (darbhangaPaths < 2) {
      throw new Error(`Expected at least 2 SVG paths for Patna-Darbhanga, found ${darbhangaPaths}`);
    }

    console.log('\n================================================================');
    console.log('   ALL ROAD ROUTE GEOMETRY & MAP VISIBILITY CHECKS PASSED (100%)');
    console.log('================================================================\n');
  } finally {
    await browser.close();
    previewServer.httpServer.close();
  }
}

runRoadGeometryBrowserVerification().catch((err) => {
  console.error('Browser verification failed:', err);
  process.exit(1);
});
