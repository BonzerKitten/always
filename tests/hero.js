// Is the globe centred under the title, and does the big number stay clear of it, as the number grows?
const { L, A } = require('./state.js'); const fs = require('fs');
const pad = (n) => String(n).padStart(2, '0');
const cfgFor = (root, heroDays) => {
  let cfg = fs.readFileSync(root + '/config.js', 'utf8').split('\r\n').join('\n'); if (heroDays === null) return cfg;
  const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - heroDays);
  const out = cfg.replace(/together: \{[^}]*\}/, 'together: { year: ' + d.getFullYear() + ', month: ' + (d.getMonth() + 1) + ', day: ' + d.getDate() + ' }'); if (out === cfg) throw new Error('config not changed'); return out;
};
const read = () => { const r = (el) => { const b = el.getBoundingClientRect(); return [b.left, b.top, b.right, b.bottom]; }; const num = document.getElementById('hero-number'); const range = document.createRange(); range.selectNodeContents(num); const ink = range.getBoundingClientRect(); const cv = r(document.getElementById('globe-canvas')); const globe = r(document.getElementById('globe')); const title = r(document.getElementById('title')); const cnt = r(document.querySelector('.counters'));
  return { text: num.textContent, font: parseFloat(getComputedStyle(num).fontSize), inkRight: ink.right, inkLeft: ink.left, inkW: ink.width, globeLeft: globe[0], globeRight: globe[2], canvasMid: (cv[0] + cv[2]) / 2, titleMid: (title[0] + title[2]) / 2, mid: innerWidth / 2, countersLeft: cnt[0], countersRight: cnt[2], radius: __g.lens, sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight, iw: innerWidth, ih: innerHeight }; };
(async () => {
  const browser = await L.launch();
  try {
    for (const [W, H] of [[1024, 768], [1280, 600], [1366, 768], [1440, 900], [1920, 1080], [800, 600], [2560, 1440], [900, 700], [844, 390]]) {
      for (const days of [null, 5000, 8888, 10000, 88888]) {
        const row = [];
        for (const [tag, root] of [['now', L.REPO]]) {
          const srv = await L.serve(root, { 'globe.js': L.hooked(root), 'config.js': cfgFor(root, days) }); const { page, msgs } = await L.open(browser, srv.url, { w: W, h: H, wait: 700 });
          const m = await page.evaluate(read); const lay = await A.measure(page); const probs = A.problems(lay, { allowScroll: H < 500 }).filter((p) => !/heroNum overlaps heroLabel/.test(p));
          const gap = m.globeLeft - m.inkRight;
          row.push(tag + ': globe ' + (m.canvasMid - m.mid).toFixed(1) + ' px off centre, radius ' + m.radius.toFixed(0) + ', number ' + m.text + ' at ' + m.font.toFixed(1) + ' px (' + m.inkW.toFixed(0) + ' wide), ' + gap.toFixed(0) + ' px from the globe box, counters ' + (m.countersLeft - m.globeRight).toFixed(0) + ' px from it' + (m.sw > m.iw + 0.5 ? ', SIDEWAYS SCROLL' : '') + (probs.length ? ' << ' + probs.join('; ') + ' >>' : '') + (msgs.length ? ' console ' + JSON.stringify(msgs) : ''));
          await page.close(); srv.server.close();
        }
        console.log(W + 'x' + H + ' ' + (days === null ? 'today' : days) + '\n   ' + row.join('\n   '));
      }
    }
  } finally { await browser.close(); }
})().catch((e) => { console.error('ERR', e); process.exit(1); });
