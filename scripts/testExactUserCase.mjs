import { createServer } from 'vite';
import { chromium } from 'playwright';

async function testExactUserCase() {
  const server = await createServer({
    server: { port: 3116, host: '127.0.0.1' }
  });
  await server.listen();

  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  page.on('console', (msg) => {
    console.log(`[BROWSER ${msg.type().toUpperCase()}]:`, msg.text());
  });

  page.on('pageerror', (err) => {
    console.log('[UNCAUGHT EXCEPTION]:', err);
  });

  try {
    await page.goto('http://127.0.0.1:3116/', { waitUntil: 'networkidle' });

    // Open map pin
    const mapPinBtn = page.locator('button[title*="Edit origin, destination"]').first();
    await mapPinBtn.click();
    await page.waitForTimeout(300);

    // Edit Origin: Select "New Delhi, Delhi" city specifically
    const originBtn = page.locator('button:has-text("Patna")').first();
    await originBtn.click();
    await page.waitForTimeout(300);
    const originInput = page.locator('input[placeholder*="Search origin"]').first();
    await originInput.fill('New Delhi');
    await page.waitForTimeout(1000);

    // Find the item with text "New Delhi, Delhi"
    const newDelhiCard = page.locator('div:has-text("New Delhi, Delhi")').locator('button:has-text("Select")').first();
    if (await newDelhiCard.isVisible()) {
      await newDelhiCard.click();
    } else {
      // Find by text in list
      await page.locator('text=New Delhi, Delhi').first().click();
    }
    console.log('✓ Selected New Delhi city as Origin');
    await page.waitForTimeout(1500);

    // Edit Destination to Kisan Path Bypass
    const destBtn = page.locator('button:has-text("Delhi")').last();
    await destBtn.click();
    await page.waitForTimeout(300);
    const destInput = page.locator('input[placeholder*="Search destination"]').first();
    await destInput.fill('Kisan Path Bypass');
    await page.waitForTimeout(1000);
    const kisanSuggestion = page.locator('button:has-text("Select")').first();
    await kisanSuggestion.click();
    console.log('✓ Selected Kisan Path Bypass as Destination');
    await page.waitForTimeout(4000);

    // Check DOM and SVG paths
    const status = await page.evaluate(() => {
      const routePane = document.querySelector('.leaflet-route-pane-pane');
      const paths = routePane ? Array.from(routePane.querySelectorAll('path')).map(p => ({
        stroke: p.getAttribute('stroke'),
        dLength: p.getAttribute('d')?.length,
        style: window.getComputedStyle(p).display
      })) : [];
      const markers = Array.from(document.querySelectorAll('.leaflet-marker-pane .leaflet-marker-icon')).map(m => m.className);
      return {
        pathCount: paths.length,
        paths,
        markerCount: markers.length
      };
    });
    console.log('State for New Delhi -> Kisan Path:\n', JSON.stringify(status, null, 2));

    await page.screenshot({ path: 'scripts/exact-user-screenshot.png' });
    console.log('Saved screenshot: scripts/exact-user-screenshot.png');

  } finally {
    await browser.close();
    await server.close();
  }
}

testExactUserCase().catch(console.error);

