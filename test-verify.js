async function verify() {
  const res = await fetch('http://127.0.0.1:4173/');
  const html = await res.text();
  console.log('HTML byte length:', html.length);
  const regex = /(src|href)="([^"]+)"/g;
  let m;
  let allOk = true;
  while ((m = regex.exec(html)) !== null) {
    const assetPath = m[2];
    if (assetPath.startsWith('http') || assetPath.startsWith('/')) {
      const fullUrl = new URL(assetPath, 'http://127.0.0.1:4173/').href;
      const assetRes = await fetch(fullUrl);
      console.log(`Asset ${assetPath}: status ${assetRes.status} (${assetRes.headers.get('content-type')})`);
      if (assetRes.status !== 200) allOk = false;
    }
  }
  if (allOk) {
    console.log('ALL ASSETS AND SCRIPTS VERIFIED HTTP 200 OK!');
  } else {
    console.error('Some assets failed to load.');
    process.exit(1);
  }
}

verify().catch((err) => {
  console.error(err);
  process.exit(1);
});
