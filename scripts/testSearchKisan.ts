import { searchPlaces } from '../src/services/search/placesSearchService';

async function testSearch() {
  const results = await searchPlaces({ query: 'Kisan Path Bypass' });
  console.log('Results count:', results.length);
  for (const r of results) {
    console.log('Name:', r.name, 'coords:', r.coordinates, 'coords type:', typeof r.coordinates, Array.isArray(r.coordinates));
  }
}

testSearch().catch(console.error);
