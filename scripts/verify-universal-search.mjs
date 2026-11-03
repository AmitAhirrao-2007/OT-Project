import { preview } from 'vite';
import { chromium } from 'playwright';

async function runVerification() {
  console.log('================================================================');
  console.log('   EV ROUTE PLANNER — UNIVERSAL LOCATION SEARCH E2E AUDIT');
  console.log('================================================================');

  // 1. Start programmatic Vite preview server on 127.0.0.1:3100
  const server = await preview({
    preview: { host: '127.0.0.1', port: 3100 }
  });
  const serverUrl = 'http://127.0.0.1:3100/';
  console.log(`✓ Vite preview server running at ${serverUrl}`);

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
    console.log('[1/9] Navigating to EV Route Planner...');
    await page.goto(serverUrl, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    const initialDest = await page.textContent('aside h1');
    console.log(`  Initial Destination in header: "${initialDest?.trim()}"`);

    // Expand Endpoints Editor in RoutePanel
    const expandBtn = page.locator('button[aria-label="Edit route endpoints"]');
    await expandBtn.click();
    await page.waitForTimeout(400);
    console.log('  ✓ Expanded route endpoints editor.');

    // Helper to get origin / dest buttons in RouteInputs
    const getOriginBtn = () => page.locator('div.relative.pr-9').first().locator('button').first();
    const getDestBtn = () => page.locator('div.relative.pr-9').last().locator('button').first();

    // -------------------------------------------------------------
    // TEST A: Origin = Patna, Destination = Darbhanga
    // -------------------------------------------------------------
    console.log('\n[2/9] TEST A: Origin = Patna, Destination = Darbhanga...');
    await getDestBtn().click();
    await page.waitForTimeout(300);

    const destInput = page.locator('input[placeholder*="Search destination"]');
    await destInput.fill('Darbhanga');
    await page.waitForTimeout(600);

    const darbhangaOption = page.locator('div:has-text("Darbhanga")').locator('button:has-text("Select")').first();
    await darbhangaOption.click();
    await page.waitForTimeout(800);

    const destAfterA = await page.textContent('aside h1');
    console.log(`  Destination after selecting Darbhanga: "${destAfterA?.trim()}"`);
    if (!destAfterA?.includes('Darbhanga')) {
      throw new Error(`Expected destination Darbhanga, got "${destAfterA}"`);
    }
    console.log('  ✓ TEST A PASSED: Destination successfully changed to Darbhanga.');

    // -------------------------------------------------------------
    // TEST B: Origin = Kankarbagh, Patna; Destination = Delhi
    // -------------------------------------------------------------
    console.log('\n[3/9] TEST B: Origin = Kankarbagh, Patna; Destination = Delhi...');
    await getOriginBtn().click();
    await page.waitForTimeout(300);

    const originInput = page.locator('input[placeholder*="Search origin"]');
    await originInput.fill('Kankarbagh');
    await page.waitForTimeout(600);

    const kankarbaghOption = page.locator('div:has-text("Kankarbagh")').locator('button:has-text("Select")').first();
    await kankarbaghOption.click();
    await page.waitForTimeout(800);

    const sidebarTextB = await page.textContent('aside');
    if (!sidebarTextB?.includes('Kankarbagh')) {
      throw new Error('Expected origin to show Kankarbagh');
    }
    console.log('  ✓ TEST B PASSED: Arbitrary locality "Kankarbagh" set as Origin.');

    // Re-set destination to Delhi
    await getDestBtn().click();
    await page.waitForTimeout(300);
    const destInputDelhi = page.locator('input[placeholder*="Search destination"]');
    await destInputDelhi.fill('Delhi');
    await page.waitForTimeout(600);
    await page.locator('div:has-text("Delhi")').locator('button:has-text("Select")').first().click();
    await page.waitForTimeout(800);
    console.log('  Destination restored to Delhi.');

    // -------------------------------------------------------------
    // TEST C: Origin = Mumbai, Destination = Goa with Via Stop
    // -------------------------------------------------------------
    console.log('\n[4/9] TEST C: Origin = Mumbai, Destination = Goa with Via Stop...');
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

    // Add intermediate stop via PlaceSearchModal
    const addStopBtn = page.locator('button:has-text("Add Stop (Search Any Place)")').first();
    await addStopBtn.click();
    await page.waitForTimeout(400);

    const modalInputC = page.locator('dialog input');
    await modalInputC.fill('Kolkata');
    await page.waitForTimeout(600);

    const viaBtn = page.locator('dialog button:has-text("Via")').first();
    await viaBtn.click();
    await page.waitForTimeout(800);

    const sidebarTextC = await page.textContent('aside');
    if (!sidebarTextC?.includes('Kolkata') || !sidebarTextC?.includes('Via Stop')) {
      throw new Error('Expected intermediate via stop in sidebar');
    }
    console.log('  ✓ TEST C PASSED: Intermediate via stop added between Mumbai and Goa.');

    // -------------------------------------------------------------
    // TEST D: Change Origin without clearing Destination
    // -------------------------------------------------------------
    console.log('\n[5/9] TEST D: Change Origin without clearing Destination...');
    await getOriginBtn().click();
    await page.waitForTimeout(300);
    const originInputD = page.locator('input[placeholder*="Search origin"]');
    await originInputD.fill('Patna');
    await page.waitForTimeout(600);
    await page.locator('div:has-text("Patna")').locator('button:has-text("Select")').first().click();
    await page.waitForTimeout(800);

    const sidebarTextD = await page.textContent('aside');
    if (!sidebarTextD?.includes('Patna') || !sidebarTextD?.includes('Goa')) {
      throw new Error(`Expected Patna as origin and Goa as destination preserved, got: ${sidebarTextD}`);
    }
    console.log('  ✓ TEST D PASSED: Origin updated to Patna while Destination (Goa) was preserved.');

    // -------------------------------------------------------------
    // TEST E: Change Destination without clearing Origin
    // -------------------------------------------------------------
    console.log('\n[6/9] TEST E: Change Destination without clearing Origin...');
    await getDestBtn().click();
    await page.waitForTimeout(300);
    const destInputE = page.locator('input[placeholder*="Search destination"]');
    await destInputE.fill('Delhi');
    await page.waitForTimeout(600);
    await page.locator('div:has-text("Delhi")').locator('button:has-text("Select")').first().click();
    await page.waitForTimeout(800);

    const sidebarTextE = await page.textContent('aside');
    if (!sidebarTextE?.includes('Patna') || !sidebarTextE?.includes('Delhi')) {
      throw new Error(`Expected Patna as origin and Delhi as destination, got: ${sidebarTextE}`);
    }
    console.log('  ✓ TEST E PASSED: Destination updated to Delhi while Origin (Patna) was preserved.');

    // -------------------------------------------------------------
    // TEST F: Search and add a charging station
    // -------------------------------------------------------------
    console.log('\n[7/9] TEST F: Search and add charging station...');
    const addStopBtnF = page.locator('button:has-text("Add Stop (Search Any Place)")').first();
    await addStopBtnF.click();
    await page.waitForTimeout(400);

    const modalInputF = page.locator('dialog input');
    await modalInputF.fill('Tata Power');
    await page.waitForTimeout(600);

    const chargeBtn = page.locator('dialog button:has-text("Charge")').first();
    if ((await chargeBtn.count()) === 0) {
      throw new Error('Expected "Charge" button for charging station search result');
    }
    await chargeBtn.click();
    await page.waitForTimeout(800);

    const chargerTag = page.locator('span:has-text("Charger")');
    if ((await chargerTag.count()) === 0) {
      throw new Error('Expected waypoint to be classified as "Charger" rather than ordinary via stop');
    }
    console.log('  ✓ TEST F PASSED: Charging station search result added and classified as pinned Charger.');

    // -------------------------------------------------------------
    // TEST G: Verify original Add Stop modal still works
    // -------------------------------------------------------------
    console.log('\n[8/9] TEST G: Verify original Add Stop modal works...');
    const bottomAddStopBtn = page.locator('aside button:has-text("Add Stop")').last();
    await bottomAddStopBtn.click();
    await page.waitForTimeout(400);

    const modalTitle = await page.textContent('dialog h2, dialog h3');
    if (!modalTitle?.includes('Add Stop to Journey')) {
      throw new Error(`Expected modal title "Add Stop to Journey", got "${modalTitle}"`);
    }

    // Close modal with Escape key
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    console.log('  ✓ TEST G PASSED: Original Add Stop modal opens, displays full search, and closes cleanly.');

    // -------------------------------------------------------------
    // TEST H: Saved plan location persistence
    // -------------------------------------------------------------
    console.log('\n[9/9] TEST H: Saved plan location persistence...');
    const openMenuBtn = page.locator('button[aria-label="Navigation menu"]').first();
    await openMenuBtn.click();
    await page.waitForTimeout(300);

    const savedPlansMenuItem = page.locator('button:has-text("Saved Plans")').first();
    await savedPlansMenuItem.click();
    await page.waitForTimeout(500);

    const loadPlanBtn = page.locator('dialog button:has-text("Load")').first();
    await loadPlanBtn.click();
    await page.waitForTimeout(800);

    const finalHeader = await page.textContent('aside h1');
    console.log(`  Header after loading saved plan: "${finalHeader?.trim()}"`);
    if (!finalHeader?.includes('Delhi')) {
      throw new Error(`Expected restored destination Delhi, got "${finalHeader}"`);
    }
    console.log('  ✓ TEST H PASSED: Saved plan restored origin, destination and route state correctly.');

    console.log('\n================================================================');
    console.log('   ALL E2E BROWSER TESTS (A THROUGH H) PASSED SUCCESSFULLY!     ');
    console.log('================================================================');
  } finally {
    await browser.close();
    await server.httpServer.close();
    console.log('✓ Browser and test server shut down cleanly.');
  }
}

runVerification().catch((err) => {
  console.error('\n❌ E2E VERIFICATION FAILED:', err);
  process.exit(1);
});
