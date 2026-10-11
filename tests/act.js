// Real-input helpers (mouse or touch) plus a layout measure. Pin positions are read through the test handle only to know WHERE to tap.
const L = require('./lib.js');
exports.snap = (page) => page.evaluate(() => __g.snap());
exports.settle = async (page, max = 6000) => { const t = Date.now(); let calm = 0; while (Date.now() - t < max) { const a = await page.evaluate(() => __g.animating || __g.queued || __g.flying || __g.zoom !== __g.zoomGoal); calm = a ? 0 : calm + 1; if (calm >= 3) break; await L.sleep(60); } await L.sleep(380); };
exports.makeInput = async (page, touch) => {
  const cdp = await page.createCDPSession();
  const T = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
  const box = () => L.canvasBox(page);
  return {
    touch,
    async tap(x, y) { const b = await box(); if (touch) await page.touchscreen.tap(b.x + x, b.y + y); else await page.mouse.click(b.x + x, b.y + y); },
    async drag(x0, y0, x1, y1) {
      const b = await box(); const n = Math.max(4, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 10));
      if (touch) { await T('touchStart', [{ x: b.x + x0, y: b.y + y0, id: 1 }]); for (let i = 1; i <= n; i++) { await T('touchMove', [{ x: b.x + x0 + (x1 - x0) * i / n, y: b.y + y0 + (y1 - y0) * i / n, id: 1 }]); await L.sleep(8); } await L.sleep(150); await T('touchEnd', []); }
      else { await page.mouse.move(b.x + x0, b.y + y0); await page.mouse.down(); for (let i = 1; i <= n; i++) await page.mouse.move(b.x + x0 + (x1 - x0) * i / n, b.y + y0 + (y1 - y0) * i / n); await L.sleep(150); await page.mouse.up(); }
      await L.sleep(120);
    },
    // zoom about canvas point by a factor (>1 in), with wheel notches or a pinch
    async zoomBy(x, y, factor) {
      const b = await box();
      if (touch) { const g0 = factor > 1 ? 24 : 160, g1 = Math.max(6, g0 * factor); await T('touchStart', [{ x: b.x + x - g0 / 2, y: b.y + y, id: 1 }]); await T('touchStart', [{ x: b.x + x - g0 / 2, y: b.y + y, id: 1 }, { x: b.x + x + g0 / 2, y: b.y + y, id: 2 }]); for (let i = 1; i <= 12; i++) { const g = g0 + (g1 - g0) * i / 12; await T('touchMove', [{ x: b.x + x - g / 2, y: b.y + y, id: 1 }, { x: b.x + x + g / 2, y: b.y + y, id: 2 }]); await L.sleep(14); } await T('touchEnd', []); }
      else { await page.mouse.move(b.x + x, b.y + y); let left = Math.log(factor); while (Math.abs(left) > 1e-6) { const step = Math.max(-0.22, Math.min(0.22, left)); await page.mouse.wheel({ deltaY: -step / 0.0022 }); left -= step; await L.sleep(30); } }
      await exports.settle(page);
    },
    async zoomOutFully() { for (let k = 0; k < 12; k++) { const s = await exports.snap(page); if (s.zoom <= 1) break; await this.zoomBy(s.side / 2, s.side / 2, touch ? 0.04 : Math.max(1 / s.zoom / 1.5, 0.001)); } },
  };
};
const visibleRep = (s, place) => s.nodes.filter((n) => n.m.includes(place) && n.w >= 0.5 && n.vis >= 0.5 && n.z > 0.05).sort((a, b) => a.m.length - b.m.length)[0];
exports.visibleRep = visibleRep;
// Gets a place to be the single active pin using only taps (and zoom-out / drags when it is out of view). Returns a log of what was done.
exports.reach = async (page, input, place, name, log = [], onState = null) => {
  for (let step = 0; step < 14; step++) {
    await exports.settle(page);
    let s = await exports.snap(page); if (onState) await onState(s, log);
    let rep = visibleRep(s, place);
    if (!rep) {
      if (s.zoom > 1) { await input.zoomOutFully(); log.push('zoom out fully'); continue; }
      const node = s.nodes[place]; const dx = s.side / 2 - node.ox, dy = s.side / 2 - node.oy; const len = Math.hypot(dx, dy) || 1; const d = Math.min(s.lens * 0.8, node.z > 0 ? len : s.lens * 0.8);
      const ux = dx / len, uy = dy / len;
      await input.drag(s.side / 2 - ux * d / 2, s.side / 2 - uy * d / 2, s.side / 2 + ux * d / 2, s.side / 2 + uy * d / 2); log.push('drag ' + Math.round(d) + ' px'); continue;
    }
    await input.tap(rep.x, rep.y);
    if (rep.m.length === 1) {
      await L.sleep(750); const cap = await L.cap(page); s = await exports.snap(page);
      log.push('tap pin'); return { ok: cap.name === name && cap.vis && s.active === place, cap, log, snap: s };
    }
    log.push('tap group of ' + rep.m.length);
  }
  return { ok: false, cap: await L.cap(page), log };
};
// Layout facts for the current state.
exports.measure = (page) => page.evaluate(() => {
  const textRects = (el) => { const out = []; const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) { if (!n.textContent.trim()) continue; const r = document.createRange(); r.selectNodeContents(n); for (const b of r.getClientRects()) if (b.width > 0 && b.height > 0) out.push([b.left, b.top, b.right, b.bottom]); } return out; };
  const ids = { title: "title", since: "subtitle", heroNum: "hero-number", heroLabel: "hero-label", heroSub: "hero-breakdown", metNum: "met-number", metLabel: "met-label", annNum: "anniversary-number", annLabel: "anniversary-label", halfNum: "half-number", halfLabel: "half-label", capName: "cap-name", capNote: "cap-note" };
  const items = {}; for (const k in ids) { let el = document.getElementById(ids[k]); if (k === "capName") el = el.parentElement; const cs = getComputedStyle(el); if (cs.display === "none" || el.hidden) continue; const rs = textRects(el); if (!rs.length) continue; items[k] = [Math.min(...rs.map((r) => r[0])), Math.min(...rs.map((r) => r[1])), Math.max(...rs.map((r) => r[2])), Math.max(...rs.map((r) => r[3]))]; }
  const c = document.getElementById("globe-canvas").getBoundingClientRect();
  const bands = [...document.querySelectorAll(".meander")].map((b) => { const r = b.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; });
  const cap = document.getElementById("caption").getBoundingClientRect();
  const lis = [...document.querySelectorAll(".counters li")].map((b) => { const r = b.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; });
  const nums = [...document.querySelectorAll(".counters .num")].map((b) => { const r = b.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom, b.scrollWidth, b.clientWidth]; });
  const hero = document.querySelector(".hero").getBoundingClientRect();
  return { items, canvas: [c.left, c.top, c.width], lens: __g.lens, bands, caption: [cap.left, cap.top, cap.right, cap.bottom], lis, nums, hero: [hero.left, hero.top, hero.right, hero.bottom], sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight, iw: innerWidth, ih: innerHeight, scrollY, zoom: __g.zoom };
});
// Problems found in one measure (strings). allowScroll for the small sizes.
exports.problems = (m, { allowScroll = false } = {}) => {
  const out = []; const names = Object.keys(m.items);
  if (!allowScroll && (m.sh > m.ih + 0.5 || m.sw > m.iw + 0.5)) out.push("page scrolls: " + m.sw + "x" + m.sh + " in " + m.iw + "x" + m.ih);
  if (m.sw > m.iw + 0.5) out.push("sideways scroll " + m.sw + " > " + m.iw);
  const top = m.bands[0][3] - m.scrollY * 0, bottom = m.bands[1][1];
  for (const k of names) { const r = m.items[k]; if (r[0] < -0.5 || r[2] > m.iw + 0.5) out.push(k + " clipped sideways " + r.map((v) => v.toFixed(1))); if (r[1] < top - 0.5 || r[3] > bottom + 0.5) out.push(k + " crosses a band " + r.map((v) => v.toFixed(1)) + " bands " + top.toFixed(1) + "/" + bottom.toFixed(1)); }
  for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) { const a = m.items[names[i]], b = m.items[names[j]]; const ox = Math.min(a[2], b[2]) - Math.max(a[0], b[0]), oy = Math.min(a[3], b[3]) - Math.max(a[1], b[1]); if (ox > 0.5 && oy > 0.5) out.push(names[i] + " overlaps " + names[j] + " by " + ox.toFixed(1) + "x" + oy.toFixed(1)); }
  const cx = m.canvas[0] + m.canvas[2] / 2, cy = m.canvas[1] + m.canvas[2] / 2;
  for (const k of names) { const r = m.items[k]; const nx = Math.max(r[0], Math.min(cx, r[2])), ny = Math.max(r[1], Math.min(cy, r[3])); const d = Math.hypot(nx - cx, ny - cy); if (d < m.lens) out.push(k + " is inside the lens circle by " + (m.lens - d).toFixed(1) + " px"); }
  return out;
};
