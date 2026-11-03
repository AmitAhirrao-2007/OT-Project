import fs from 'fs';

const env = fs.readFileSync('.env', 'utf-8');
const key = env.match(/TOMTOM_API_KEY=(.+)/)?.[1]?.trim();

const testCases = [
  { cat: 'City', q: 'Bhopal' },
  { cat: 'Town/Village', q: 'Darbhanga' },
  { cat: 'Locality', q: 'Karol Bagh' },
  { cat: 'Street', q: 'Kankarbagh Main Road' },
  { cat: 'Address', q: 'Connaught Place Block A' },
  { cat: 'Building', q: 'DLF Cyber City' },
  { cat: 'Restaurant', q: 'Haldirams New Delhi' },
  { cat: 'Hotel', q: 'Hotel Maurya Patna' },
  { cat: 'Hospital', q: 'AIIMS New Delhi' },
  { cat: 'University', q: 'IIT Delhi' },
  { cat: 'Mall', q: 'Select Citywalk' },
  { cat: 'Airport', q: 'Indira Gandhi International Airport' },
  { cat: 'Railway Station', q: 'New Delhi Railway Station' },
  { cat: 'Bus Station', q: 'ISBT Kashmere Gate' },
  { cat: 'Attraction', q: 'India Gate' },
  { cat: 'Religious', q: 'Golden Temple Amritsar' },
  { cat: 'Highway', q: 'Yamuna Expressway' },
  { cat: 'International', q: 'Eiffel Tower Paris' }
];

async function runTests() {
  console.log('Testing TomTom Search v2 across all 18 categories:');
  for (const tc of testCases) {
    try {
      const url = `https://api.tomtom.com/search/2/search/${encodeURIComponent(tc.q)}.json?key=${key}&limit=3&idxSet=POI,PAD,Str,Geo,Addr`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        const r0 = data.results?.[0];
        const name = r0?.poi?.name || r0?.address?.freeformAddress || 'N/A';
        const type = r0?.type || 'N/A';
        const lat = r0?.position?.lat?.toFixed(4);
        const lon = r0?.position?.lon?.toFixed(4);
        console.log(`✓ [${tc.cat}] "${tc.q}": Found "${name}" (${type}) at [${lat}, ${lon}], Total: ${data.totalResults || data.results?.length}`);
      } else {
        console.log(`✗ [${tc.cat}] "${tc.q}": HTTP ${res.status}`);
      }
    } catch (e) {
      console.log(`✗ [${tc.cat}] "${tc.q}": Error ${e.message}`);
    }
  }
}

runTests();

