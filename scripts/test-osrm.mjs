async function testOsrm() {
  const coordsStr = '77.20900,28.61390;80.94620,26.84670';
  const url = 'https://router.project-osrm.org/route/v1/driving/' + coordsStr + '?overview=full&geometries=geojson&steps=false&alternatives=true';
  const res = await fetch(url);
  const data = await res.json();
  console.log('OSRM code:', data.code);
  console.log('Routes count:', data.routes?.length);
  if (data.routes?.length > 0) {
    const r0 = data.routes[0];
    console.log('R0 distance mi:', Math.round(r0.distance * 0.000621371));
    console.log('R0 duration min:', Math.round(r0.duration / 60));
    console.log('R0 coords count:', r0.geometry?.coordinates?.length);
    console.log('R0 coords first 3:', r0.geometry?.coordinates?.slice(0, 3));
    if (data.routes.length > 1) {
      const r1 = data.routes[1];
      console.log('R1 distance mi:', Math.round(r1.distance * 0.000621371));
      console.log('R1 duration min:', Math.round(r1.duration / 60));
    }
  }
}
testOsrm().catch(console.error);

