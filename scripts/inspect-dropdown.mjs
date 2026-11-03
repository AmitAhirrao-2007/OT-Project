import { preview } from 'vite';
import { chromium } from 'playwright';

async function inspectDropdown() {
  const previewServer = await preview({
    preview: { host: '127.0.0.1', port: 3110 }
  });

  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  try {
    await page.goto('http://127.0.0.1:3110', { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);

    await page.locator('button[aria-label="Edit route endpoints"]').click();
    await page.waitForTimeout(300);

    const getOriginBtn = () => page.locator('div.relative.pr-9').first().locator('button').first();
    await getOriginBtn().click();
    await page.waitForTimeout(200);

    const originInput = page.locator('input[placeholder*="Search origin"]');
    await originInput.fill('New Delhi');
    await page.waitForTimeout(600);

    const dropdownHtml = await page.evaluate(() => {
      const dropdown = document.querySelector('.shadow-dropdown');
      return dropdown ? dropdown.innerHTML : 'No dropdown found';
    });

    console.log('--- DROPDOWN HTML ---');
    console.log(dropdownHtml);

  } finally {
    await browser.close();
    previewServer.httpServer.close();
  }
}

inspectDropdown().catch(console.error);

