import fs from 'fs';

const env = fs.readFileSync('.env', 'utf-8');
const key = env.match(/TOMTOM_API_KEY=(.+)/)?.[1]?.trim();

const routes = [
  { name: 'Delhi to Bhopal', coords: [[28.6139, 77.2090], [23.2523, 77.4311]] },
  { name: 'Patna to Darbhanga', coords: [[25.5941, 85.1376], [26.1563, 85.8943]] },
  { name: 'Mumbai to Goa', coords: [[19.0760, 72.8777], [15.2993, 74.1240]] }
];

async function testRoutes() {
  console.log('Testing Real TomTom Traffic on 3 requested routes with key:', key?.slice(0, 8) + '...\n');

  for (const r of routes) {
    console.log(`=== Testing Route: ${r.name} ===`);
    const locStr = `${r.coords[0][0]},${r.coords[0][1]}:${r.coords[1][0]},${r.coords[1][1]}`;

    // 1. TomTom calculateRoute with traffic
    const routeUrl = `https://api.tomtom.com/routing/1/calculateRoute/${locStr}/json?key=${key}&traffic=true&computeTravelTimeFor=all&travelMode=car`;
    const res = await fetch(routeUrl);
    if (!res.ok) {
      console.log('Route error:', res.status, await res.text());
      continue;
    }
    const data = await res.json();
    const rt = data.routes?.[0];
    const summary = rt?.summary;
    console.log(`Distance: ${(summary.lengthInMeters * 0.000621371).toFixed(1)} mi`);
    console.log(`Travel Time: ${(summary.travelTimeInSeconds / 60).toFixed(0)} min, Traffic Delay: ${(summary.trafficDelayInSeconds / 60).toFixed(0)} min`);
    console.log(`No-traffic Time: ${(summary.noTrafficTravelTimeInSeconds / 60).toFixed(0)} min`);

    // 2. Query flow segment samples along this route
    const pts = rt?.legs?.[0]?.points || [];
    console.log(`Total road points in geometry: ${pts.length}`);
    if (pts.length > 0) {
      // Sample 3 points: origin area, middle, destination area
      const samples = [
        { label: 'Origin Approach', pt: pts[Math.min(50, pts.length - 1)] },
        { label: 'Mid-Corridor', pt: pts[Math.floor(pts.length / 2)] },
        { label: 'Destination Approach', pt: pts[Math.max(0, pts.length - 50)] }
      ];

      for (const s of samples) {
        const flowUrl = `https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json?point=${s.pt.latitude},${s.pt.longitude}&unit=mph&key=${key}`;
        const fRes = await fetch(flowUrl);
        if (fRes.ok) {
          const fData = await fRes.json();
          const f = fData.flowSegmentData;
          const ratio = f.freeFlowSpeed > 0 ? (f.currentSpeed / f.freeFlowSpeed).toFixed(2) : '1.0';
          console.log(`  [${s.label}] Speed: ${f.currentSpeed} mph / Free-Flow: ${f.freeFlowSpeed} mph (Ratio: ${ratio}), Closed: ${f.roadClosure}, Confidence: ${f.confidence}`);
        } else {
          console.log(`  [${s.label}] Flow query failed: HTTP ${fRes.status}`);
        }
      }
    }
    console.log('');
  }
}

testRoutes();

