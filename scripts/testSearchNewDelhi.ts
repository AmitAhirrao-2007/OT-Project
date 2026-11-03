import { searchPlaces } from '../src/services/search/placesSearchService';

async function testNewDelhi() {
  const results = await searchPlaces({ query: 'New Delhi' });
  console.log('Results count:', results.length);
  for (const r of results) {
    console.log(r.name, '|', r.subTitle, '|', r.address, '| coords:', r.coordinates);
  }
}

testNewDelhi().catch(console.error);

