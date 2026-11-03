import { createServer } from 'vite';
import { chromium } from 'playwright';

async function testRoute() {
  const server = await createServer({
    server: { port: 3112, host: '127.0.0.1' }
  });
  await server.listen();

  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  page.on('console', (msg) => {
    console.log(`[PAGE ${msg.type()}]:`, msg.text());
  });

  try {
    await page.goto('http://127.0.0.1:3112/', { waitUntil: 'networkidle' });

    // Open endpoints editor
    const mapPinBtn = page.locator('button[title*="Edit origin, destination"]').first();
    await mapPinBtn.click();
    await page.waitForTimeout(400);

    // Click origin button to open search
    console.log('Opening origin search...');
    const originBtn = page.locator('button:has-text("Patna")').first();
    await originBtn.click();
    await page.waitForTimeout(400);

    const originInput = page.locator('input[placeholder*="Search origin"]').first();
    await originInput.fill('New Delhi');
    await page.waitForTimeout(1000);

    // Click the "Select" button on the first suggestion
    const firstSelectBtn = page.locator('button:has-text("Select")').first();
    await firstSelectBtn.click();
    console.log('✓ Selected New Delhi origin');
    await page.waitForTimeout(1500);

    // Click destination button to open search
    console.log('Opening destination search...');
    const destBtn = page.locator('button:has-text("Delhi")').last();
    await destBtn.click();
    await page.waitForTimeout(400);

    const destInput = page.locator('input[placeholder*="Search destination"]').first();
    await destInput.fill('Kisan Path Bypass');
    await page.waitForTimeout(1000);

    const destSelectBtn = page.locator('button:has-text("Select")').first();
    await destSelectBtn.click();
    console.log('✓ Selected Kisan Path destination');
    await page.waitForTimeout(3500);

    // Inspect map state
    const mapDetails = await page.evaluate(() => {
      const mapEl = document.querySelector('.leaflet-container');
      // @ts-ignore
      const map = mapEl?._leaflet_map;
      const routePane = document.querySelector('.leaflet-route-pane-pane');
      const paths = routePane ? Array.from(routePane.querySelectorAll('path')).map(p => ({
        stroke: p.getAttribute('stroke'),
        strokeWidth: p.getAttribute('stroke-width'),
        opacity: p.getAttribute('stroke-opacity'),
        dLength: p.getAttribute('d')?.length,
        dStart: p.getAttribute('d')?.slice(0, 30)
      })) : [];

      const markers = Array.from(document.querySelectorAll('.leaflet-marker-pane .leaflet-marker-icon')).map(m => m.className);

      return {
        hasMap: Boolean(map),
        zoom: map?.getZoom(),
        center: map?.getCenter(),
        routePanePathsCount: paths.length,
        paths,
        markerCount: markers.length
      };
    });

    console.log('Map Details after New Delhi -> Kisan Path Bypass:\n', JSON.stringify(mapDetails, null, 2));

    await page.screenshot({ path: 'scripts/kisan-path-repro.png' });
    console.log('Screenshot saved to scripts/kisan-path-repro.png');

    // Click Alternative Road 1
    console.log('\nClicking Alternative Road 1...');
    const altRoad = page.locator('text=Alternative Road 1').first();
    if (await altRoad.isVisible()) {
      await altRoad.click();
      await page.waitForTimeout(1000);
      const afterAltClick = await page.evaluate(() => {
        const routePane = document.querySelector('.leaflet-route-pane-pane');
        const paths = routePane ? Array.from(routePane.querySelectorAll('path')).map(p => ({
          stroke: p.getAttribute('stroke'),
          strokeWidth: p.getAttribute('stroke-width'),
          dLength: p.getAttribute('d')?.length
        })) : [];
        return { paths };
      });
      console.log('Paths after clicking Alt Road 1:\n', JSON.stringify(afterAltClick, null, 2));
    }

  } finally {
    await browser.close();
    await server.close();
  }
}

testRoute().catch(console.error);
