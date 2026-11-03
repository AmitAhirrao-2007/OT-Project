import http from 'http';

async function testProxyRouting() {
  console.log('Testing /api/routing/calculate for Delhi -> Kisan Path Bypass...');
  
  // Test with local ocpiProxyServer if running, or query OSRM directly
  const payload = {
    locations: [
      [28.6139, 77.2090], // New Delhi
      [26.8467, 80.9462]  // Kisan Path Bypass
    ],
    routeType: 'fastest',
    maxAlternatives: 2
  };

  try {
    const res = await fetch('http://127.0.0.1:3001/api/routing/calculate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    console.log('Proxy Status:', res.status);
    const json = await res.json();
    console.log('Provider:', json.provider);
    console.log('Routes count:', json.routes?.length);
    if (json.routes?.length > 0) {
      for (let i = 0; i < json.routes.length; i++) {
        const r = json.routes[i];
        console.log(`Route ${i}:`, r.name, 'Distance:', r.distanceMi, 'mi, Coords:', r.coordinates?.length);
        console.log(`Route ${i} first 3 coords:`, JSON.stringify(r.coordinates?.slice(0, 3)));
        console.log(`Route ${i} last 3 coords:`, JSON.stringify(r.coordinates?.slice(-3)));
      }
    }
  } catch (err) {
    console.error('Fetch error:', err.message);
  }
}

testProxyRouting();

