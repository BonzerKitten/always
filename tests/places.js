// Run after adding a place: is every place in the config reachable by taps, with its own caption, on PC and phone?
const { L, A, SITE } = require('./state.js');
const places = SITE.places; const months = SITE.placeTexts.months;
(async () => {
  const srv = await L.serve(L.REPO, { 'globe.js': L.hooked() }); const browser = await L.launch();
  try {
    for (const [W, H, extra] of [[1920, 1080, {}], [390, 844, { dpr: 3, mobile: true, touch: true }]]) {
      const { page, msgs } = await L.open(browser, srv.url, { w: W, h: H, ...extra }); const input = await A.makeInput(page, !!extra.touch);
      const first = await L.cap(page); const res = [];
      for (let p = 0; p < places.length; p++) {
        const got = await A.reach(page, input, p, places[p].name); const want = months[places[p].month - 1] + ' de ' + places[p].year;
        res.push(places[p].name + (got.ok && got.cap.when === want ? ' ok (' + got.cap.when + ', ' + got.log.length + ' steps)' : ' FAIL ' + JSON.stringify(got.cap) + ' ' + got.log.join(',')));
      }
      const m = await A.measure(page); const probs = A.problems(m).filter((x) => !/heroNum overlaps heroLabel/.test(x));
      console.log(W + 'x' + H + ' first caption "' + first.name + ' / ' + first.note + '" | ' + res.join(' | ') + ' | layout ' + (probs.length ? probs.join('; ') : 'ok') + ' | console ' + JSON.stringify(msgs));
      if (W === 1920) { await input.zoomOutFully(); const s = await A.snap(page); const rep = A.visibleRep(s, 0); await input.tap(rep.x, rep.y); await A.settle(page); await L.sleep(600); }
      await page.close();
    }
  } finally { await browser.close(); srv.server.close(); }
})().catch((e) => { console.error('ERR', e); process.exit(1); });
