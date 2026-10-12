// Checks of the globe's behaviour. node globe.js [letters, e.g. ABC]   (all letters when none is given)
// A, B: zooming with the pointer beyond a pole never flips the view. C, D: dragging. E: taps and wheel during a flight.
// F: the pin on the rim fades when zooming starts. G: a damaged land-detail.js. H: a group's hint after a resize.
// I: wheel aim, reaching every place by taps, no redraws while idle. J: nothing is drawn far outside the lens.
const { L, A, state, NAMES, touchT } = require('./state.js'); const fs = require('fs');
const want = (process.argv[2] || 'ABCDEFGHIJ').toUpperCase();
const D = Math.PI / 180;
const say = (r) => r.desc + (r.bad.length ? ' << ' + r.bad.join('; ') + ' >>' : '');
const turned = (a, b) => { const p = (s) => [Math.cos(s.lat * D) * Math.cos(s.lon * D), Math.cos(s.lat * D) * Math.sin(s.lon * D), Math.sin(s.lat * D)]; const u = p(a), v = p(b); return Math.acos(Math.max(-1, Math.min(1, u[0] * v[0] + u[1] * v[1] + u[2] * v[2]))) / D; };
const rafCount = () => { const raf = window.requestAnimationFrame.bind(window); window.__raf = 0; window.requestAnimationFrame = (cb) => { window.__raf++; return raf(cb); }; };
// Where the spot of the Earth that was under canvas point (x0, y0) in view s0 is drawn in view s1, minus (x1, y1).
const drift = (s0, x0, y0, s1, x1, y1) => { const R0 = s0.lens * s0.zoom, R1 = s1.lens * s1.zoom; const ll = L.inv((x0 - s0.side / 2) / R0, (s0.side / 2 - y0) / R0, s0.lon, s0.lat); if (!ll) return NaN; const p = L.proj(ll[0], ll[1], s1.lon, s1.lat); return Math.hypot(s1.side / 2 + p[0] * R1 - x1, s1.side / 2 - p[1] * R1 - y1); };

(async () => {
  const srv = await L.serve(L.REPO, { 'globe.js': L.hooked() }); const browser = await L.launch();
  const pc = async (w = 1920, h = 1080, extra = {}) => { const o = await L.open(browser, srv.url, { w, h, ...extra }); const box = await L.canvasBox(o.page); return { ...o, box, c: [box.x + box.w / 2, box.y + box.w / 2], R: await o.page.evaluate(() => __g.lens) }; };
  try {
    if (want.includes('A')) {
      const { page, c, R, msgs } = await pc();
      for (const [lat, z0, up] of [[51.3, 1, 0.85], [51.3, 1, 0.7], [70, 1, 0.5], [70, 1.6, 0.7], [30, 1, 0.95], [-60, 1, -0.8]]) {
        await page.evaluate((b, z) => __g.view(-1, b, z), lat, z0); await A.settle(page);
        await page.mouse.move(c[0], c[1] - up * R); const log = []; let worst = 0;
        for (let i = 0; i < 3; i++) { await page.mouse.wheel({ deltaY: -100 }); await A.settle(page); const s = await A.snap(page); log.push(s.zoom.toFixed(2) + '@' + s.lon.toFixed(0) + ',' + s.lat.toFixed(0)); worst = Math.max(worst, Math.abs(((s.lon + 1 + 540) % 360) - 180)); }
        console.log('A wheel beyond the pole: view -1,' + lat + ' z' + z0 + ' pointer ' + up + 'R up: ' + log.join(' -> ') + (worst > 20 ? '  FAIL (longitude moved ' + worst.toFixed(0) + ')' : '  ok'));
      }
      console.log('A console', JSON.stringify(msgs)); await page.close();
    }
    if (want.includes('B')) {
      const { page, box, R, msgs } = await pc(390, 844, { dpr: 3, mobile: true, touch: true }); const T = await touchT(page);
      await page.evaluate(() => __g.view(-1, 51.3, 1)); await A.settle(page); const x = box.x + box.w / 2, y = box.y + box.w / 2 - 0.8 * R; const log = []; let worst = 0;
      await T('touchStart', [{ x: x - 20, y, id: 1 }]); await T('touchStart', [{ x: x - 20, y, id: 1 }, { x: x + 20, y, id: 2 }]);
      for (let g = 40; g <= 80; g += 4) { await T('touchMove', [{ x: x - g / 2, y, id: 1 }, { x: x + g / 2, y, id: 2 }]); await L.sleep(16); const s = await A.snap(page); worst = Math.max(worst, Math.abs(((s.lon + 1 + 540) % 360) - 180)); if (g % 8 === 0) log.push(s.zoom.toFixed(2) + '@' + s.lon.toFixed(0) + ',' + s.lat.toFixed(0)); }
      await T('touchEnd', []); console.log('B pinch beyond the pole on a phone: ' + log.join(' ') + (worst > 20 ? '  FAIL' : '  ok')); console.log('B console', JSON.stringify(msgs)); await page.close();
    }
    if (want.includes('C')) {
      for (const [W, H, extra] of [[1920, 1080, {}], [390, 844, { dpr: 3, mobile: true, touch: true }]]) {
        const { page, box, c, R } = await pc(W, H, extra); const T = await touchT(page); const touch = !!extra.touch;
        for (const [z, up, dx, ms] of [[1.25, 0.85, 13, 100], [1.25, 0.43, 30, 160], [1.25, 0.84, 30, 160], [1.5, 0.6, 30, 160], [1.3, 0.85, 13, 100], [3, 0.8, 30, 160]]) {
          await page.evaluate((zz) => __g.view(-1, 51.4, zz), z); await A.settle(page); const s0 = await A.snap(page); const x = c[0], y = c[1] - up * R; const n = 6; let jump = 0, prev = s0;
          if (touch) await T('touchStart', [{ x, y, id: 1 }]); else { await page.mouse.move(x, y); await page.mouse.down(); }
          for (let i = 1; i <= n; i++) { const px = x + dx * i / n; if (touch) await T('touchMove', [{ x: px, y, id: 1 }]); else await page.mouse.move(px, y); await L.sleep(ms / n); const s = await A.snap(page); jump = Math.max(jump, turned(prev, s)); prev = s; }
          if (touch) await T('touchEnd', []); else await page.mouse.up();
          const s1 = prev; await A.settle(page); const s2 = await A.snap(page); const during = turned(s0, s1), coast = turned(s1, s2);
          console.log('C ' + W + 'x' + H + ' drag ' + dx + ' px sideways from ' + up + 'R above the middle at zoom ' + z + ': turned ' + during.toFixed(1) + ' deg (largest step ' + jump.toFixed(1) + '), then coasted ' + coast.toFixed(1) + ' deg, ends ' + s2.lon.toFixed(1) + ',' + s2.lat.toFixed(1) + (during > 15 || coast > 20 ? '  FAIL' : '  ok'));
        }
        await page.close();
      }
    }
    if (want.includes('D')) {
      const { page, box, c } = await pc();
      for (const [lon, lat, z, px] of [[20, 73, 50, 120], [20, 73, 228, 120], [20, 65, 20, 120], [20, 50, 5, 200], [20, 0, 50, 200], [20, 50, 50, 200], [20, 73, 1, 120], [20, 50, 1, 200], [-0.6, 51.2, 180, 150]]) {
        for (const [ux, uy] of [[1, 0], [0, 1], [0.7, 0.7]]) {
          await page.evaluate((a, b, zz) => __g.view(a, b, zz), lon, lat, z); await A.settle(page); const s0 = await A.snap(page);
          const x0 = s0.side / 2 - ux * px / 2, y0 = s0.side / 2 - uy * px / 2, x1 = x0 + ux * px, y1 = y0 + uy * px; const n = 12;
          await page.mouse.move(box.x + x0, box.y + y0); await page.mouse.down(); for (let i = 1; i <= n; i++) await page.mouse.move(box.x + x0 + (x1 - x0) * i / n, box.y + y0 + (y1 - y0) * i / n); await L.sleep(200); const s1 = await A.snap(page); await page.mouse.up(); await A.settle(page);
          const d = drift(s0, x0, y0, s1, x1, y1); console.log('D drag ' + px + ' px (' + ux + ',' + uy + ') at ' + lat + ' N zoom ' + z + ': grabbed spot ends ' + d.toFixed(1) + ' px from the pointer');
        }
      }
      await page.close();
    }
    if (want.includes('E')) {
      for (const [W, H, extra] of [[1920, 1080, {}], [390, 844, { dpr: 3, mobile: true, touch: true }]]) {
        for (const gapMs of [120, 250, 400, 700]) for (const place of [5, 0]) {
          const { page, box, msgs } = await pc(W, H, extra); const s = await A.snap(page); const rep = A.visibleRep(s, place); const x = box.x + rep.x, y = box.y + rep.y;
          if (extra.touch) { await page.touchscreen.tap(x, y); await L.sleep(gapMs); await page.touchscreen.tap(x, y); } else { await page.mouse.click(x, y); await L.sleep(gapMs); await page.mouse.click(x, y); }
          const r = await state(page, NAMES); const ok = !r.bad.length && r.cap.vis && r.shownCount > 0;
          console.log('E ' + W + 'x' + H + ' double ' + (extra.touch ? 'tap' : 'click') + ' ' + gapMs + ' ms apart on the group holding ' + NAMES[place] + ': ' + say(r) + (ok ? '  ok' : '  FAIL') + (msgs.length ? ' console ' + JSON.stringify(msgs) : '')); await page.close();
        }
      }
      // A press that becomes a drag still takes over; a press held still does not stop the flight.
      const { page, box } = await pc(); let s = await A.snap(page); let rep = A.visibleRep(s, 0);
      await page.mouse.click(box.x + rep.x, box.y + rep.y); await L.sleep(200); await page.mouse.move(box.x + s.side / 2, box.y + s.side / 2); await page.mouse.down(); await L.sleep(60); const mid = await A.snap(page); for (let i = 1; i <= 8; i++) await page.mouse.move(box.x + s.side / 2 + i * 5, box.y + s.side / 2); const after = await A.snap(page); await L.sleep(200); await page.mouse.up();
      let r = await state(page, NAMES); console.log('E drag 200 ms into a flight: flying while pressed still ' + mid.flying + ', flying once dragging ' + after.flying + ' | ' + say(r));
      await page.evaluate(() => __g.view(-48, -20, 1)); await A.settle(page); s = await A.snap(page); rep = A.visibleRep(s, 0);
      await page.mouse.click(box.x + rep.x, box.y + rep.y); await L.sleep(200); await page.mouse.move(box.x + 30, box.y + 30); await page.mouse.down(); await L.sleep(500); await page.mouse.up();
      r = await state(page, NAMES); console.log('E press held still on empty globe during a flight: ' + say(r) + (r.s.zoom > 5 ? '  ok (landed)' : '  FAIL'));
      await page.evaluate(() => __g.view(-48, -20, 1)); await A.settle(page); s = await A.snap(page); rep = A.visibleRep(s, 0);
      await page.mouse.click(box.x + rep.x, box.y + rep.y); await L.sleep(150); await page.mouse.wheel({ deltaY: 100 }); await L.sleep(60); await page.mouse.wheel({ deltaY: -100 });
      r = await state(page, NAMES); console.log('E wheel during a flight: ' + say(r)); const z1 = r.s.zoom; await page.mouse.move(box.x + s.side / 2, box.y + s.side / 2); await page.mouse.wheel({ deltaY: 100 }); await A.settle(page); console.log('E next wheel notch out after landing: zoom ' + z1.toFixed(2) + ' -> ' + (await A.snap(page)).zoom.toFixed(2));
      await page.close();
    }
    if (want.includes('F')) {
      for (const [W, H, extra, step] of [[1366, 768, {}, 4], [1920, 1080, {}, 4], [390, 844, { dpr: 3, mobile: true, touch: true }, 4], [1366, 768, {}, 100]]) {
        const { page, box, c } = await pc(W, H, extra); const s0 = await A.snap(page); const node = s0.nodes.find((n) => n.m.length === 4 && n.m.includes(5)); if (!node) { console.log('F no England group at load'); await page.close(); continue; }
        await page.mouse.move(c[0], c[1]); const rows = []; let prev = node.vis, worstDrop = 0, farOut = 0;
        for (let i = 0; i < (step === 4 ? 140 : 3); i++) {
          await page.mouse.wheel({ deltaY: -step });
          for (let f = 0; f < (step === 4 ? 1 : 14); f++) { await L.sleep(16); const s = await A.snap(page); const n = s.nodes[node.i]; const out = Math.hypot(n.x - s.side / 2, n.y - s.side / 2) - s.lens; worstDrop = Math.max(worstDrop, prev - n.vis); if (n.vis > 0.05) farOut = Math.max(farOut, out); if (prev !== n.vis) rows.push(s.zoom.toFixed(3) + ':' + n.vis.toFixed(2)); prev = n.vis; }
        }
        console.log('F ' + W + 'x' + H + ' wheel steps of ' + step + ': England pin visibility by zoom ' + rows.slice(0, 40).join(' ') + ' | largest one-frame drop ' + (worstDrop * 100).toFixed(0) + '% | farthest outside the lens while still visible ' + farOut.toFixed(1) + ' px (' + (100 * farOut / s0.lens).toFixed(1) + '% of the radius)');
        // and back out: comes back the same way, ends as at load
        for (let i = 0; i < 20; i++) { await page.mouse.wheel({ deltaY: 100 }); await L.sleep(30); } await A.settle(page); const s1 = await A.snap(page); console.log('F   zoomed back out: zoom ' + s1.zoom + ', England pin visibility ' + s1.nodes[node.i].vis.toFixed(2));
        await page.close();
      }
    }
    if (want.includes('G')) {
      const bodies = { 'list of numbers': 'const LAND_DETAIL = [1, 2, 3, 4];', 'short rings': 'const LAND_DETAIL = [[1000,2000,5,5],[3000,4000,1,1]];', 'empty rings': 'const LAND_DETAIL = [[],[]];', 'strings': 'const LAND_DETAIL = [["a"]];', 'empty list': 'const LAND_DETAIL = [];', 'a number': 'const LAND_DETAIL = 5;', 'off the map': 'const LAND_DETAIL = [[999999,0,1,1,1,1,1,1]];', 'missing (404)': null };
      for (const name in bodies) {
        const s2 = await L.serve(L.REPO, { 'globe.js': L.hooked(), 'land-detail.js': bodies[name] }); const { page, msgs } = await L.open(browser, s2.url, { w: 1366, h: 768 }); const box = await L.canvasBox(page);
        await page.mouse.move(box.x + box.w / 2, box.y + box.w / 2); await page.mouse.wheel({ deltaY: -100 }); await A.settle(page); await page.evaluate(() => __g.view(0, 50.4, 20)); await A.settle(page); await L.sleep(700);
        const st = await page.evaluate(() => __g.detail); const coast = await page.evaluate(() => { const cv = document.getElementById('globe-canvas'); const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 0 && d[i] > 150 && d[i + 1] > 150 && d[i + 2] > 170) n++; return n; });
        console.log('G damaged detail file (' + name + '): state ' + st + ', bright coast pixels at zoom 20 over the Channel ' + coast + (st.startsWith('failed') && coast > 50 ? '  ok' : '  FAIL') + ' console ' + JSON.stringify(msgs.filter((m) => !/land-detail|404/.test(m)))); await page.close(); s2.server.close();
      }
      const { page } = await pc(1366, 768); const box = await L.canvasBox(page); await page.mouse.move(box.x + box.w / 2, box.y + box.w / 2); await page.mouse.wheel({ deltaY: -100 }); await A.settle(page); await page.evaluate(() => __g.view(0, 50.4, 20)); await A.settle(page); await L.sleep(900);
      console.log('G the real detail file: state ' + await page.evaluate(() => __g.detail)); await page.close();
    }
    if (want.includes('H')) {
      const cfg = fs.readFileSync(L.REPO + '/config.js', 'utf8').split('\r\n').join('\n'); const head = cfg.indexOf('places: ['); const tail = cfg.indexOf('  ],', head);
      const cfgE = cfg.slice(0, tail) + "    { name: 'Perto', lat: 51.2557, lon: -0.57, year: 2027, month: 1 },\n" + cfg.slice(tail); const names = NAMES.concat(['Perto']);
      const s2 = await L.serve(L.REPO, { 'globe.js': L.hooked(), 'config.js': cfgE }); const { page } = await L.open(browser, s2.url, { w: 768, h: 1024 });
      const zmax = await page.evaluate(() => __g.zoomMax); await page.evaluate((z) => __g.view(-0.57, 51.248, z), zmax * 0.7); await A.settle(page);
      let r = await state(page, names); console.log('H 768x1024, pair 1.75 km apart in the middle: ' + say(r) + ' stuck=' + (r.s.active >= 0 && r.s.nodes[r.s.active].st));
      await page.setViewport({ width: 1024, height: 768 }); await L.sleep(600); r = await state(page, names); const n = r.s.nodes[r.s.active];
      console.log('H after turning to 1024x768: ' + say(r) + ' stuck=' + (n && n.st) + (r.bad.length ? '  FAIL' : '  ok'));
      await page.setViewport({ width: 768, height: 1024 }); await L.sleep(600); r = await state(page, names); console.log('H and back to 768x1024: ' + say(r) + (r.bad.length ? '  FAIL' : '  ok')); await page.close(); s2.server.close();
    }
    if (want.includes('I')) {
      const { page, box, c, R, msgs } = await pc();
      for (const [lon, lat, ox, oy] of [[-48, -20, 0.3, 0.2], [-1, 51.3, -0.4, -0.3], [-46, -23, 0, 0], [100, 10, 0.5, -0.5]]) {
        await page.evaluate((a, b) => __g.view(a, b, 1), lon, lat); await A.settle(page); const s0 = await A.snap(page); const x = s0.side / 2 + ox * R, y = s0.side / 2 + oy * R; await page.mouse.move(box.x + x, box.y + y); let worst = 0;
        for (let i = 0; i < 12; i++) { await page.mouse.wheel({ deltaY: -100 }); await A.settle(page, 2000); worst = Math.max(worst, drift(s0, x, y, await A.snap(page), x, y)); }
        for (let i = 0; i < 12; i++) { await page.mouse.wheel({ deltaY: 100 }); await A.settle(page, 2000); }
        const s1 = await A.snap(page); console.log('I wheel aim at ' + lon + ',' + lat + ' pointer (' + ox + ',' + oy + ')R: spot stays within ' + worst.toFixed(2) + ' px zooming in; back out to zoom ' + s1.zoom.toFixed(2) + ', centre moved ' + turned(s0, s1).toFixed(2) + ' deg');
      }
      console.log('I console', JSON.stringify(msgs)); await page.close();
      for (const [W, H, extra] of [[1920, 1080, {}], [1366, 768, {}], [390, 844, { dpr: 3, mobile: true, touch: true }], [360, 640, { dpr: 3, mobile: true, touch: true }]]) {
        const o = await L.open(browser, srv.url, { w: W, h: H, ...extra, init: rafCount }); const input = await A.makeInput(o.page, !!extra.touch);
        let r = await state(o.page, NAMES); const first = say(r); const f0 = await o.page.evaluate(() => window.__raf); await L.sleep(2000); const idle1 = await o.page.evaluate(() => window.__raf) - f0;
        const res = [];
        for (let p = 0; p < NAMES.length; p++) { const got = await A.reach(o.page, input, p, NAMES[p]); const st = await state(o.page, NAMES, { allowScroll: false, tapped: true }); res.push(NAMES[p] + (got.ok && !st.bad.length ? ' ok(' + got.log.length + ')' : ' FAIL ' + got.log.join(',') + ' ' + st.bad.join(';') + ' cap ' + JSON.stringify(got.cap))); }
        const f1 = await o.page.evaluate(() => window.__raf); await L.sleep(2000); const idle2 = await o.page.evaluate(() => window.__raf) - f1;
        await input.zoomOutFully(); r = await state(o.page, NAMES);
        console.log('I ' + W + 'x' + H + ' first load: ' + first + ' | idle frames in 2 s at load ' + idle1 + ', zoomed in ' + idle2 + ' | reach: ' + res.join(', ') + ' | zoomed back out: ' + say(r) + ' | console ' + JSON.stringify(o.msgs)); await o.page.close();
      }
    }
    if (want.includes('J')) {
      // Lens containment: nothing of the planet, and no clearly visible pin, far outside the lens at any zoom.
      const { page } = await pc(1366, 768); let worst = 0, worstAt = '';
      for (let k = 0; k < 120; k++) {
        const z = Math.exp(Math.random() * Math.log(180)); const lon = [-46, -1, -50, 20, 140][k % 5] + (Math.random() - 0.5) * (k % 2 ? 4 : 60) / Math.sqrt(z), lat = [-23, 51.3, -29, 40, -30][k % 5] + (Math.random() - 0.5) * (k % 2 ? 3 : 40) / Math.sqrt(z);
        await page.evaluate((a, b, zz) => { __g.view(a, b, zz); __g.drawNow(); }, lon, lat, z);
        const out = await page.evaluate(() => { const cv = document.getElementById('globe-canvas'); const w = cv.width, d = cv.getContext('2d').getImageData(0, 0, w, w).data; const k = w / __g.side, R = __g.lens * k, c = w / 2; let far = 0; for (let y = 0; y < w; y += 2) for (let x = 0; x < w; x += 2) { const a = d[(y * w + x) * 4 + 3]; if (a > 40) { const r = Math.hypot(x - c, y - c) - R; if (r > far) far = r; } } return far / k; });
        if (out > worst) { worst = out; worstAt = 'zoom ' + z.toFixed(2) + ' at ' + lon.toFixed(1) + ',' + lat.toFixed(1); }
      }
      const R = await page.evaluate(() => __g.lens); console.log('J 120 random views at 1366x768: farthest drawing (alpha over 40/255) outside the lens ' + worst.toFixed(1) + ' px (' + (100 * worst / R).toFixed(1) + '% of the radius) at ' + worstAt); await page.close();
    }
  } finally { await browser.close(); srv.server.close(); }
})().catch((e) => { console.error('ERR', e); process.exit(1); });
