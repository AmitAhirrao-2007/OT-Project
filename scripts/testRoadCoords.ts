import { calculateRoadRouteAlternatives } from '../src/services/traffic/trafficService';

async function test() {
  const alts = await calculateRoadRouteAlternatives([[28.6139, 77.2090], [26.8467, 80.9462]], { maxAlternatives: 3 });
  console.log('Alternatives count:', alts.length);
  for (const a of alts) {
    console.log(a.name, 'source:', a.source, 'coords count:', a.coordinates?.length, 'sample start:', a.coordinates?.slice(0, 3), 'end:', a.coordinates?.slice(-3));
  }
}

test().catch(console.error);

