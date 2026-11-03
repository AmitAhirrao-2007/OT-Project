import fs from 'fs';

const env = fs.readFileSync('.env', 'utf-8');
const key = env.match(/TOMTOM_API_KEY=(.+)/)?.[1]?.trim();

async function checkLegs() {
  const locStr = '28.6139,77.2090:23.2523,77.4311'; // Delhi to Bhopal
  const url = `https://api.tomtom.com/routing/1/calculateRoute/${locStr}/json?key=${key}&traffic=true&computeTravelTimeFor=all&travelMode=car`;
  const res = await fetch(url);
  const data = await res.json();
  const leg0 = data.routes?.[0]?.legs?.[0];
  console.log('Leg summary:', leg0?.summary);
  console.log('Leg points count:', leg0?.points?.length);
  console.log('Leg fields:', Object.keys(leg0 || {}));
}

checkLegs();

