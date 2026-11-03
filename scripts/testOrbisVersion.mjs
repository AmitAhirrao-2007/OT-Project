import fs from 'fs';

const env = fs.readFileSync('.env', 'utf-8');
const key = env.match(/TOMTOM_API_KEY=(.+)/)?.[1]?.trim();

async function testOrbisVersion(apiVersionQuery, apiVersionHeader) {
  console.log(`\nTesting Orbis query=${apiVersionQuery}, header=${apiVersionHeader}`);
  try {
    const headers = {
      'Content-Type': 'application/json',
      'TomTom-Api-Key': key
    };
    if (apiVersionHeader) {
      headers['TomTom-Api-Version'] = apiVersionHeader;
    }
    const qParam = apiVersionQuery ? `&apiVersion=${apiVersionQuery}` : '';
    const res = await fetch(`https://api.tomtom.com/maps/orbis/places/suggest?key=${key}${qParam}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query: 'Delhi', limit: 3 })
    });
    console.log('Status:', res.status);
    const text = await res.text();
    console.log('Response:', text.slice(0, 200));
  } catch (err) {
    console.log('Error:', err.message);
  }
}

async function testSearchEndpoints() {
  await testOrbisVersion(null, '1');
  await testOrbisVersion('1', '1');
  await testOrbisVersion(null, null);
  // Also test TomTom Search v2 autocomplete / fuzzy
  try {
    const res = await fetch(`https://api.tomtom.com/search/2/autocomplete/Delhi.json?key=${key}&language=en-GB&limit=3`);
    console.log('\nSearch v2 Autocomplete Status:', res.status);
    console.log('Autocomplete text:', (await res.text()).slice(0, 200));
  } catch (err) {
    console.log('Autocomplete error:', err.message);
  }
}

testSearchEndpoints();

