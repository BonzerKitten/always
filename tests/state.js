// A check that the page is in a consistent state (caption, active pin, leader line, zoom), plus the place names.
const L = require('./lib.js'), A = require('./act.js');
exports.L = L; exports.A = A;
const lead = (page) => page.evaluate(() => { const l = document.getElementById('leader-line'), c = document.getElementById('globe-canvas').getBoundingClientRect(), sl = document.getElementById('globe-slot').getBoundingClientRect(); return { x1: +l.getAttribute('x1') + sl.left - c.left, y1: +l.getAttribute('y1') + sl.top - c.top, op: getComputedStyle(document.getElementById('leader')).opacity, capOp: getComputedStyle(document.getElementById('caption')).opacity, cls: document.getElementById('leader').className.baseVal, sy: scrollY, sx: scrollX, vv: visualViewport.scale }; });
exports.lead = lead;
// State check after things have settled. names = place names in config order.
// tapped: the active pin was chosen by a tap, which keeps the globe where it is, so it need not be the pin nearest the middle.
exports.state = async (page, names, { settle = true, allowScroll = false, tapped = false } = {}) => {
  if (settle) { await A.settle(page); await L.sleep(520); }
  const s = await A.snap(page); const cap = await L.cap(page); const ld = await lead(page); const bad = [];
  const shown = s.nodes.filter((n) => n.w >= 0.5 && n.vis >= 0.5 && n.z > 0.05); const d = (n) => Math.hypot(n.x - s.side / 2, n.y - s.side / 2);
  if (s.flying) bad.push('still flying');
  if (s.goal !== s.zoom) bad.push('zoom goal ' + s.goal + ' != zoom ' + s.zoom);
  if (s.zoom < 1 || s.zoom > s.max + 1e-9) bad.push('zoom out of range ' + s.zoom);
  if (s.anim || s.queued) bad.push('still animating');
  if (!allowScroll && (ld.sy !== 0 || ld.sx !== 0 || ld.vv !== 1)) bad.push('page moved: scroll ' + ld.sx + ',' + ld.sy + ' scale ' + ld.vv);
  if (s.active >= 0) {
    const n = s.nodes[s.active]; const sorted = n.m.slice().sort((a, b) => a - b);
    const want = s.member >= 0 ? names[sorted[s.member]] : n.m.length === 1 ? names[n.m[0]] : n.m.length + ' lugares';
    if (!(n.w >= 0.15 && n.vis >= 0.15 && n.z > 0.05)) bad.push('active pin not visible (w ' + n.w.toFixed(2) + ' lens ' + n.vis.toFixed(2) + ' z ' + n.z.toFixed(2) + ')');
    if (cap.name !== want || !cap.vis || ld.capOp !== '1') bad.push('caption "' + cap.name + '" visible ' + cap.vis + ' op ' + ld.capOp + ' but active is ' + want);
    if (s.shown !== s.active || s.shownMember !== s.member) bad.push('shown ' + s.shown + '/' + s.shownMember + ' != active ' + s.active + '/' + s.member);
    if (n.m.length > 1 && s.member < 0) { const wantNote = n.st ? 'Toque para ver cada um' : 'Aproxime para ver cada um'; if (cap.note !== wantNote) bad.push('group note "' + cap.note + '" but stuck=' + n.st); }
    if (n.m.length > 1 && s.member >= 0 && !n.st) bad.push('member shown for a group that is not stuck');
    const gap = Math.hypot(ld.x1 - n.x, ld.y1 - n.y); if (Math.abs(gap - (Math.max(15, 0.125 * s.lens) + 3)) > 1.5) bad.push('leader starts ' + gap.toFixed(1) + ' px from the active pin');
    if (ld.op !== '1' && n.vis >= 0.15) bad.push('leader opacity ' + ld.op);
    if (n.lv < 0.99) bad.push('active pin level ' + n.lv.toFixed(2));
    const best = shown.slice().sort((a, b) => d(a) - d(b))[0]; if (!tapped && best && d(best) < d(n) - 0.07 * s.lens - 1) bad.push('active is ' + d(n).toFixed(0) + ' px from centre but pin [' + best.m + '] is at ' + d(best).toFixed(0));
  } else { if (cap.vis) bad.push('nothing active but caption visible: ' + cap.name); if (shown.length) bad.push('nothing active although pins visible: ' + shown.map((n) => '[' + n.m + ']').join(' ')); }
  s.nodes.forEach((n) => { if (n.i !== s.active && n.lv > 0.001) bad.push('node ' + n.i + ' still highlighted (level ' + n.lv.toFixed(2) + ')'); });
  return { bad, s, cap, ld, shownCount: shown.length, desc: 'zoom ' + s.zoom.toFixed(2) + ' centre ' + s.lon.toFixed(2) + ',' + s.lat.toFixed(2) + ' active ' + (s.active < 0 ? 'none' : '[' + s.nodes[s.active].m + ']' + (s.member >= 0 ? '#' + s.member : '')) + ' caption ' + (cap.vis ? '"' + cap.name + (cap.when ? ', ' + cap.when : '') + (cap.note ? ' / ' + cap.note : '') + '"' : 'hidden') + ' pins in lens ' + shown.length };
};
const vm = require('vm'); const box = {}; vm.createContext(box); vm.runInContext(require('fs').readFileSync(L.REPO + '/config.js', 'utf8') + ';this.SITE = SITE;', box);
exports.SITE = box.SITE;
exports.NAMES = box.SITE.places.map((place) => place.name);
exports.touchT = async (page) => { const cdp = await page.createCDPSession(); return (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts }); };