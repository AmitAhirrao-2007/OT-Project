async function check() {
  try {
    const res = await fetch('http://127.0.0.1:3001/api/routing/calculate', { method: 'POST' });
    console.log('Status:', res.status);
    console.log('Headers:', Object.fromEntries(res.headers.entries()));
    console.log('Body:', await res.text());
  } catch (e) {
    console.error('Err:', e.message);
  }
}
check();

