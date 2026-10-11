// Shared by the tests: a small local web server for the site, a headless browser, and a few helpers.
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const puppeteer = require('puppeteer-core');
const REPO = path.resolve(__dirname, '..').replace(/\\/g, '/');
// Browser profiles and screenshots go to the system's temporary folder, never into the repository.
const TMP = path.join(os.tmpdir(), 'always-tests').replace(/\\/g, '/');
fs.mkdirSync(TMP, { recursive: true });
// Any Chromium browser works; set BROWSER_PATH to use another one.
const EDGE = process.env.BROWSER_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.woff2': 'font/woff2' };
exports.TMP = TMP; exports.REPO = REPO;
// overrides: { 'file': string | null (404) | {delay, body} }
exports.serve = (root = REPO, overrides = {}) => new Promise((res) => {
  const log = [];
  const s = http.createServer((q, r) => {
    let p = decodeURIComponent(q.url.split('?')[0]); log.push(p);
    if (!p.startsWith('/always/')) { r.writeHead(404); r.end(); return; }
    p = p.slice('/always/'.length) || 'index.html';
    const send = (body) => { r.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream', 'cache-control': 'no-store' }); r.end(body); };
    if (p in overrides) {
      const o = overrides[p];
      if (o === null) { r.writeHead(404); r.end(); return; }
      if (typeof o === 'object' && o.delay) { setTimeout(() => send(o.body), o.delay); return; }
      send(o); return;
    }
    fs.readFile(path.join(root, p), (e, d) => { if (e) { r.writeHead(404); r.end(); return; } send(d); });
  });
  s.listen(0, '127.0.0.1', () => res({ server: s, url: 'http://127.0.0.1:' + s.address().port + '/always/', log }));
});
let n = 0;
exports.launch = (extra = []) => puppeteer.launch({ executablePath: EDGE, headless: 'new', userDataDir: TMP + '/profile-' + process.pid + '-' + (n++), args: ['--disable-gpu', '--no-first-run', '--disable-extensions', '--disable-background-networking', '--disable-component-update', '--disable-sync', '--no-default-browser-check', ...extra] });
exports.open = async (browser, url, { w, h, dpr = 1, touch = false, mobile = false, init, reduced = false, wait = 500, tz } = {}) => {
  const page = await browser.newPage();
  await page.setViewport({ width: w, height: h, deviceScaleFactor: dpr, hasTouch: touch, isMobile: mobile });
  if (reduced) await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  if (tz) await page.emulateTimezone(tz);
  const msgs = [], requests = [];
  page.on('console', (m) => msgs.push(m.type() + ': ' + m.text()));
  page.on('pageerror', (e) => msgs.push('pageerror: ' + e.message));
  page.on('requestfailed', (rq) => msgs.push('requestfailed: ' + rq.url()));
  page.on('request', (rq) => requests.push(rq.url()));
  if (init) await page.evaluateOnNewDocument(init);
  await page.goto(url, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await new Promise((r) => setTimeout(r, wait));
  return { page, msgs, requests };
};
exports.sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// A test-only handle (window.__g) is added inside the globe's code in the SERVED copy only; the real file is untouched.
exports.hooked = (root = REPO) => {
  const src = fs.readFileSync(root + '/globe.js', 'utf8').replace(/\r\n/g, '\n');
  const out = src.replace(/\n  resize\(\);\n\}\)\(\);\s*$/, fs.readFileSync(__dirname + '/hook-tail.txt', 'utf8'));
  if (out === src) throw new Error('hook not applied');
  return out;
};
exports.canvasBox = (page) => page.evaluate(() => { const r = document.getElementById('globe-canvas').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
exports.cap = (page) => page.evaluate(() => ({ name: document.getElementById('cap-name').textContent, when: document.getElementById('cap-when').hidden ? null : document.getElementById('cap-year').textContent, note: document.getElementById('cap-note').textContent, vis: document.getElementById('caption').classList.contains('visible'), leader: document.getElementById('leader').className.baseVal }));
// own orthographic projection: returns [right, up, toward] unit
exports.proj = (lon, lat, clon, clat) => { const D = Math.PI / 180; const l = (lon - clon) * D, p = lat * D, p0 = clat * D; return [Math.cos(p) * Math.sin(l), Math.cos(p0) * Math.sin(p) - Math.sin(p0) * Math.cos(p) * Math.cos(l), Math.sin(p0) * Math.sin(p) + Math.cos(p0) * Math.cos(p) * Math.cos(l)]; };
// inverse: right/up (unit of planet radius) -> [lon, lat]
exports.inv = (x, y, clon, clat) => { const D = Math.PI / 180; const rho = Math.hypot(x, y); if (rho > 1) return null; if (rho < 1e-12) return [clon, clat]; const c = Math.asin(rho), p0 = clat * D; const lat = Math.asin(Math.cos(c) * Math.sin(p0) + y * Math.sin(c) * Math.cos(p0) / rho); const lon = clon * D + Math.atan2(x * Math.sin(c), rho * Math.cos(c) * Math.cos(p0) - y * Math.sin(c) * Math.sin(p0)); return [((lon / D + 540) % 360) - 180, lat / D]; };
