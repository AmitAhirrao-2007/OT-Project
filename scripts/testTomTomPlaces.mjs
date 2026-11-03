import fs from 'fs';

const env = fs.readFileSync('.env', 'utf-8');
const key = env.match(/TOMTOM_API_KEY=(.+)/)?.[1]?.trim();
console.log('Testing with key:', key?.slice(0, 8) + '...');

async function testQuery(q) {
  console.log(`\n================ Testing Query: "${q}" ================`);
  // 1. Orbis Suggest
  try {
    const res = await fetch(`https://api.tomtom.com/maps/orbis/places/suggest?key=${key}&apiVersion=1`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'TomTom-Api-Version': '3',
        'TomTom-Api-Key': key
      },
      body: JSON.stringify({ query: q, limit: 5 })
    });
    console.log('Orbis Suggest HTTP:', res.status);
    if (res.ok) {
      const data = await res.json();
      console.log('Orbis results count:', data.results?.length);
      if (data.results?.length) {
        console.log('Orbis result 0:', JSON.stringify(data.results[0], null, 2));
      }
    } else {
      console.log('Orbis error text:', await res.text());
    }
  } catch (err) {
    console.error('Orbis error:', err.message);
  }

  // 2. TomTom Search v2 (Fuzzy / Multi-Index Search)
  try {
    const res = await fetch(`https://api.tomtom.com/search/2/search/${encodeURIComponent(q)}.json?key=${key}&limit=5&idxSet=POI,PAD,Str,Geo,Addr`);
    console.log('Search v2 HTTP:', res.status);
    if (res.ok) {
      const data = await res.json();
      console.log('Search v2 results count:', data.results?.length);
      if (data.results?.length) {
        console.log('Search v2 result 0 summary:');
        console.log(' - Name:', data.results[0].poi?.name || data.results[0].address?.freeformAddress);
        console.log(' - Type:', data.results[0].type);
        console.log(' - Position:', data.results[0].position);
        console.log(' - Address:', data.results[0].address?.freeformAddress);
      }
    } else {
      console.log('Search v2 error text:', await res.text());
    }
  } catch (err) {
    console.error('Search v2 error:', err.message);
  }
}

async function run() {
  await testQuery('Karol Bagh');
  await testQuery('Bhopal');
  await testQuery('Darbhanga');
  await testQuery('Kankarbagh Main Road');
  await testQuery('Hotel Maurya Patna');
  await testQuery('AIIMS New Delhi');
}

run();

