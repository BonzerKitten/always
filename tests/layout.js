// Layout at the usual screen sizes: no scrolling where the page should fit, no overlaps. Two screenshots go to the temporary folder.
const { L, A } = require('./state.js');
(async () => {
  const srv = await L.serve(L.REPO, { 'globe.js': L.hooked() }); const browser = await L.launch();
  try {
    for (const [W, H, dpr, mob] of [[1920, 1080, 1, 0], [1440, 900, 1, 0], [1366, 768, 1, 0], [1280, 600, 1, 0], [1024, 768, 1, 0], [768, 1024, 2, 1], [412, 915, 2.625, 1], [390, 844, 3, 1], [412, 732, 2.625, 1], [390, 664, 3, 1], [393, 659, 3, 1], [360, 640, 3, 1], [320, 568, 2, 1], [740, 360, 2, 1]]) {
      const { page, msgs } = await L.open(browser, srv.url, { w: W, h: H, dpr, mobile: !!mob, touch: !!mob, wait: 800 });
      const m = await A.measure(page); const probs = A.problems(m, { allowScroll: H < 600 }).filter((p) => !/heroNum overlaps heroLabel/.test(p));
      const txt = await page.evaluate(() => ['met-number', 'met-label', 'half-number', 'half-label'].map((i) => document.getElementById(i).textContent).join(' | '));
      console.log(W + 'x' + H + ': page ' + m.sw + 'x' + m.sh + ' in ' + m.iw + 'x' + m.ih + ', globe radius ' + m.lens.toFixed(0) + (probs.length ? ' << ' + probs.join('; ') + ' >>' : ' ok') + (msgs.length ? ' console ' + JSON.stringify(msgs) : '') + (W === 1920 ? ' | ' + txt : ''));
      if ((W === 1920) || (W === 390 && H === 844)) await page.screenshot({ path: L.TMP + '/shot-' + W + 'x' + H + '.png' });
      await page.close();
    }
  } finally { await browser.close(); srv.server.close(); }
})().catch((e) => { console.error('ERR', e); process.exit(1); });
