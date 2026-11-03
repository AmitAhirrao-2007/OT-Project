import { preview } from 'vite';
import { chromium } from 'playwright';

async function takeScreenshot() {
  const previewServer = await preview({ preview: { host: '127.0.0.1', port: 3112 } });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto('http://127.0.0.1:3112', { waitUntil: 'networkidle' });

  // Expand endpoints
  const expandBtn = page.locator('button[aria-label="Edit route endpoints"]');
  await expandBtn.click();
  await page.waitForTimeout(300);

  const getOriginBtn = () => page.locator('div.relative.pr-9').first().locator('button').first();
  const getDestBtn = () => page.locator('div.relative.pr-9').last().locator('button').first();

  // Set Origin: New Delhi
  await getOriginBtn().click();
  await page.waitForTimeout(200);
  const originInput = page.locator('input[placeholder*="Search origin"]');
  await originInput.fill('New Delhi');
  await page.waitForTimeout(600);
  const originOpt = page.locator('.shadow-dropdown button:has-text("Select")').first();
  await originOpt.waitFor({ state: 'visible', timeout: 5000 });
  await originOpt.click();
  await page.waitForTimeout(600);

  // Set Destination: Kisan Path Bypass
  await getDestBtn().click();
  await page.waitForTimeout(200);
  const destInput = page.locator('input[placeholder*="Search destination"]');
  await destInput.fill('Kisan Path');
  await page.waitForTimeout(600);
  const destOpt = page.locator('.shadow-dropdown button:has-text("Select")').first();
  await destOpt.waitFor({ state: 'visible', timeout: 5000 });
  await destOpt.click();
  await page.waitForTimeout(2500);

  // Take screenshot
  await page.screenshot({ path: 'test-user-screenshot.png' });
  console.log('Saved screenshot to test-user-screenshot.png');

  const info = await page.evaluate(() => {
    const allPaths = Array.from(document.querySelectorAll('svg path'));
    const routePane = document.querySelector('.leaflet-route-pane-pane') || document.querySelector('.leaflet-route-pane');
    const routePaths = routePane ? Array.from(routePane.querySelectorAll('path')) : [];
    return {
      routePanePathsCount: routePaths.length,
      routePathsDetails: routePaths.map(p => ({
        stroke: p.getAttribute('stroke'),
        d: p.getAttribute('d'),
        rect: p.getBoundingClientRect()
      })),
      mapCenter: [window.mapInstance?.getCenter?.()?.lat, window.mapInstance?.getCenter?.()?.lng],
      mapZoom: window.mapInstance?.getZoom?.()
    };
  });
  console.log('Route paths info:', JSON.stringify(info, null, 2));

  await browser.close();
  previewServer.httpServer.close();
}
takeScreenshot().catch(console.error);

