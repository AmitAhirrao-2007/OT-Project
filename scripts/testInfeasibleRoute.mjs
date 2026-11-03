import { createServer } from 'vite';
import { chromium } from 'playwright';

async function testInfeasible() {
  const server = await createServer({
    server: { port: 3115, host: '127.0.0.1' }
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
    await page.goto('http://127.0.0.1:3115/', { waitUntil: 'networkidle' });

    // Directly set trip state using evaluate to exactly match user's screenshot
    await page.evaluate(async () => {
      // Find react root or trigger replan
      // Let's set the origin to New Delhi, Delhi exactly
    });

    // Open map pin
    const mapPinBtn = page.locator('button[title*="Edit origin, destination"]').first();
    await mapPinBtn.click();
    await page.waitForTimeout(300);

    // Edit Origin to New Delhi, Delhi
    const originBtn = page.locator('button:has-text("Patna")').first();
    await originBtn.click();
    await page.waitForTimeout(300);
    const originInput = page.locator('input[placeholder*="Search origin"]').first();
    await originInput.fill('New Delhi');
    await page.waitForTimeout(1000);
    // Click the specific item "New Delhi, Delhi"
    const newDelhiSuggestion = page.locator('button:has-text("Select")').first();
    await newDelhiSuggestion.click();
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
    await page.waitForTimeout(4000);

    await page.screenshot({ path: 'scripts/infeasible-delhi-kisan.png' });
    console.log('Saved screenshot 1: scripts/infeasible-delhi-kisan.png');

    // Click on Alternative Road 1
    console.log('Clicking Alternative Road 1...');
    const alt1 = page.locator('text=Alternative Road 1').first();
    if (await alt1.isVisible()) {
      await alt1.click();
      await page.waitForTimeout(2000);
      await page.screenshot({ path: 'scripts/infeasible-alt1-clicked.png' });
      console.log('Saved screenshot 2: scripts/infeasible-alt1-clicked.png');
    }

  } finally {
    await browser.close();
    await server.close();
  }
}

testInfeasible().catch(console.error);

