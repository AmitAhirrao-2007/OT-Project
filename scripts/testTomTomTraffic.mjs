import fs from 'fs';

const env = fs.readFileSync('.env', 'utf-8');
const key = env.match(/TOMTOM_API_KEY=(.+)/)?.[1]?.trim();

async function testTraffic() {
  console.log('Testing Traffic APIs with key:', key?.slice(0, 8) + '...');

  // 1. TomTom Routing with sectionType=traffic
  try {
    const locStr = '28.6139,77.2090:23.2523,77.4311'; // Delhi to Bhopal
    const url = `https://api.tomtom.com/routing/1/calculateRoute/${locStr}/json?key=${key}&traffic=true&computeTravelTimeFor=all&sectionType=traffic&travelMode=car`;
    const res = await fetch(url);
    console.log('Routing with sectionType=traffic HTTP:', res.status);
    if (res.ok) {
      const data = await res.json();
      const route = data.routes?.[0];
      console.log('Summary:', route?.summary);
      console.log('Sections count:', route?.sections?.length);
      if (route?.sections?.length) {
        console.log('Sections sample:', JSON.stringify(route.sections.slice(0, 5), null, 2));
      }
    } else {
      console.log('Routing error:', await res.text());
    }
  } catch (err) {
    console.error('Routing err:', err.message);
  }

  // 2. TomTom Flow Segment Data (Point Sample: Delhi ring road)
  try {
    const flowUrl = `https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json?point=28.6139,77.2090&unit=mph&key=${key}`;
    const res = await fetch(flowUrl);
    console.log('FlowSegmentData HTTP:', res.status);
    if (res.ok) {
      const flowData = await res.json();
      console.log('Flow data:', JSON.stringify(flowData.flowSegmentData, null, 2));
    }
  } catch (err) {
    console.error('Flow err:', err.message);
  }

  // 3. TomTom Incidents Details
  try {
    // Delhi to Bhopal bbox: [minLat, minLon, maxLat, maxLon] = [23.0, 76.5, 29.0, 78.5]
    const incUrl = `https://api.tomtom.com/traffic/services/5/incidentDetails?bbox=76.5,23.0,78.5,29.0&fields={incidents{type,geometry{type,coordinates},properties{iconCategory,magnitudeOfDelay,events{description,code},startTime,endTime}}}&language=en-GB&key=${key}`;
    const res = await fetch(incUrl);
    console.log('Incidents HTTP:', res.status);
    if (res.ok) {
      const incData = await res.json();
      console.log('Incidents count:', incData.incidents?.length);
      if (incData.incidents?.length) {
        console.log('Incident 0:', JSON.stringify(incData.incidents[0], null, 2));
      }
    }
  } catch (err) {
    console.error('Inc err:', err.message);
  }
}

testTraffic();

