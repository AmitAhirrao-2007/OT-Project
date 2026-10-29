import fs from 'node:fs';

console.log('--- RUNNING DIST BUNDLE ASSET AUDIT ---');

const indexHtml = fs.readFileSync('dist/index.html', 'utf8');
const jsMatch = indexHtml.match(/src="(\/assets\/[^"]+\.js)"/);
const cssMatch = indexHtml.match(/href="(\/assets\/[^"]+\.css)"/);

assert(jsMatch && jsMatch[1], 'JS bundle script reference missing in dist/index.html');
assert(cssMatch && cssMatch[1], 'CSS bundle link reference missing in dist/index.html');

const jsPath = 'dist' + jsMatch[1];
const cssPath = 'dist' + cssMatch[1];

assert(fs.existsSync(jsPath), `Referenced JS file ${jsPath} does not exist!`);
assert(fs.existsSync(cssPath), `Referenced CSS file ${cssPath} does not exist!`);

const jsSize = fs.statSync(jsPath).size;
const cssSize = fs.statSync(cssPath).size;

console.log(`✓ JS Bundle: ${jsPath} (${Math.round(jsSize / 1024)} KB)`);
console.log(`✓ CSS Bundle: ${cssPath} (${Math.round(cssSize / 1024)} KB)`);
console.log('--- ALL DIST ASSETS AUDITED SUCCESSFULLY! ---');

function assert(condition, message) {
  if (!condition) {
    console.error('Assertion failed:', message);
    process.exit(1);
  }
}
