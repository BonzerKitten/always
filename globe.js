/*
 * The globe: a canvas drawing of the Earth that the visitor turns by dragging.
 * No library. It uses an orthographic projection (the Earth as seen from far away),
 * land outlines from land.js, and the places listed in config.js.
 */
(function startGlobe() {
  'use strict';

  const DEG = Math.PI / 180;
  const TWO_PI = Math.PI * 2;

  // The canvas is a little larger than the globe so pins at the edge are not cut off.
  // These two numbers must match the canvas size in style.css (228 units wide, globe 200 units).
  const DISC_SHARE = 200 / 228;

  const MAX_TILT = 75 * DEG;        // how far the globe may tip towards a pole
  const MAX_EDGE_STEP = 2;          // degrees; long map edges are split so they curve with the globe
  const GRID_STEP = 20;             // degrees between grid lines
  const ARC_STEP = 4 * DEG;         // smoothness of the globe's rim when land is cut at the edge
  const PIN_MIN_Z = 0.05;           // a pin must face the viewer at least this much to count as visible
  const TAP_MOVE_LIMIT = 6;         // pixels; moving less than this is a tap, not a drag
  const INERTIA_MS = 420;           // how long the spin takes to fade out after release
  const STOP_SPEED = 0.00002;       // radians per millisecond
  const EASE_MS = 330;              // how long a pin takes to grow into (or out of) the active look
  const FADE_OUT_MS = 220;          // the caption fades out this long before its text changes
  const SWITCH_MARGIN = 4 * DEG;    // another pin must be this much nearer the centre before it takes over

  // Colours of the starlight (the same warm tones as style.css).
  const PIN_COLOR = '#ffe38a';
  const PIN_GLOW = 'rgba(255, 227, 138, 0.9)';
  const RING_COLOR = '255, 238, 186';

  const canvas = document.getElementById('globe-canvas');
  const globeBox = document.getElementById('globe');
  const slot = document.getElementById('globe-slot');
  const caption = document.getElementById('caption');
  const leader = document.getElementById('leader');
  const leaderLine = document.getElementById('leader-line');
  const ctx = canvas.getContext('2d');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  // ---------- Geometry ----------

  // A point on the globe as a unit vector: x towards (0, 0), y towards (0, 90 east), z towards the north pole.
  function toVector(lonDeg, latDeg) {
    const lon = lonDeg * DEG;
    const lat = latDeg * DEG;
    return [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)];
  }

  const SAME_POINT = 1e-9;

  /*
   * Turns a ring of [lon, lat, lon, lat...] into unit vectors, adding points along long edges.
   * seamAfter[i] is true when the edge leaving point i runs along the 180 degree meridian. Natural Earth
   * cuts land there to fit a flat map, so those edges are needed for the fill but are not coast.
   */
  function ringToPoints(flat) {
    const vectors = [];
    const seamAfter = [];
    const count = flat.length / 2;
    for (let i = 0; i < count; i++) {
      const j = (i + 1) % count;
      const lon1 = flat[2 * i], lat1 = flat[2 * i + 1];
      const lon2 = flat[2 * j], lat2 = flat[2 * j + 1];
      const isSeam = Math.abs(lon1) === 180 && Math.abs(lon2) === 180;
      const wrapsAroundPole = Math.abs(lon2 - lon1) > 180; // from lon 180 to -180: the same line on the globe
      const steps = wrapsAroundPole
        ? 1
        : Math.max(1, Math.ceil(Math.max(Math.abs(lon2 - lon1), Math.abs(lat2 - lat1)) / MAX_EDGE_STEP));
      for (let s = 0; s < steps; s++) {
        const t = s / steps;
        const vector = toVector(lon1 + (lon2 - lon1) * t, lat1 + (lat2 - lat1) * t);
        const last = vectors[vectors.length - 1];
        if (last && Math.hypot(vector[0] - last[0], vector[1] - last[1], vector[2] - last[2]) < SAME_POINT) {
          seamAfter[seamAfter.length - 1] = isSeam; // the same point twice (lon 180 and -180): keep one
        } else {
          vectors.push(vector);
          seamAfter.push(isSeam);
        }
      }
    }
    const first = vectors[0], last = vectors[vectors.length - 1];
    if (vectors.length > 1 && Math.hypot(first[0] - last[0], first[1] - last[1], first[2] - last[2]) < SAME_POINT) {
      vectors.pop();
      seamAfter.pop();
    }
    return { vectors, seamAfter };
  }

  // Splits a ring into the open pieces of real coast, leaving out the seam edges.
  function coastPieces(vectors, seamAfter) {
    const total = vectors.length;
    const firstSeam = seamAfter.indexOf(true);
    if (firstSeam === -1) return null;
    const pieces = [];
    let piece = [];
    for (let step = 1; step <= total; step++) {
      const index = (firstSeam + step) % total;
      piece.push(vectors[index]);
      if (seamAfter[index]) {
        if (piece.length > 1) pieces.push(piece);
        piece = [];
      }
    }
    return pieces;
  }

  function makeLine(vectors, closed) {
    return { vectors, closed, view: vectors.map(() => [0, 0, 0]) };
  }

  // Drawn on a flat map, land rings run clockwise and the rare lake rings (the Caspian Sea) run anticlockwise.
  function isLakeRing(flat) {
    let doubleArea = 0;
    for (let i = 0; i < flat.length; i += 2) {
      const next = (i + 2) % flat.length;
      doubleArea += flat[i] * flat[next + 1] - flat[next] * flat[i + 1];
    }
    return doubleArea > 0;
  }

  /*
   * Each land ring has a closed outline for the fill, and (only when it has seam edges)
   * separate open coast lines for the stroke.
   */
  const landRings = LAND_RINGS.map((flat) => {
    const { vectors, seamAfter } = ringToPoints(flat);
    const pieces = coastPieces(vectors, seamAfter);
    return {
      outline: makeLine(vectors, true),
      coastLines: pieces && pieces.map((piece) => makeLine(piece, false)),
      isLake: isLakeRing(flat),
    };
  });

  // The faint grid: meridians (open lines from pole to pole) and parallels (closed circles).
  const gridLines = [];
  for (let lon = -180; lon < 180; lon += GRID_STEP) {
    const vectors = [];
    for (let lat = -90; lat <= 90; lat += 3) vectors.push(toVector(lon, lat));
    gridLines.push(makeLine(vectors, false));
  }
  for (let lat = -80; lat <= 80; lat += GRID_STEP) {
    const vectors = [];
    for (let lon = -180; lon < 180; lon += 3) vectors.push(toVector(lon, lat));
    gridLines.push(makeLine(vectors, true));
  }

  const places = SITE.places.map((place) => ({
    place,
    vector: toVector(place.lon, place.lat),
    view: [0, 0, 0],
    // Filled in on every draw: where the pin is on the canvas and how much it faces us.
    x: 0,
    y: 0,
    z: 0,
    level: 0,   // 0 = ordinary pin, 1 = fully active (eases between the two)
  }));

  // ---------- View state ----------

  let centerLon = SITE.globeStart.lon * DEG;   // the point of the Earth facing the viewer
  let centerLat = SITE.globeStart.lat * DEG;
  let side = 0;       // canvas size in CSS pixels
  let radius = 0;     // globe radius in CSS pixels
  let pixelRatio = 1;
  let activeIndex = -1;
  let drawQueued = false;
  let animating = false;     // some pin is still easing, so the next frame is needed
  let lastFrameTime = 0;

  /*
   * Turns the Earth so that (centerLon, centerLat) faces the viewer, and writes each
   * vector's position into "view": view[0] is right, view[1] is up, view[2] is towards the viewer.
   * A point is on the visible side exactly when view[2] > 0.
   */
  function turnToView(vectors, view) {
    const cosLon = Math.cos(centerLon), sinLon = Math.sin(centerLon);
    const cosLat = Math.cos(centerLat), sinLat = Math.sin(centerLat);
    for (let i = 0; i < vectors.length; i++) {
      const [x, y, z] = vectors[i];
      const towardsCenterMeridian = x * cosLon + y * sinLon;
      const east = -x * sinLon + y * cosLon;
      const out = view[i];
      out[0] = east;
      out[1] = z * cosLat - towardsCenterMeridian * sinLat;
      out[2] = z * sinLat + towardsCenterMeridian * cosLat;
    }
  }

  // ---------- Cutting lines at the edge of the globe ----------

  /*
   * Returns the visible pieces of a line as chains of canvas points.
   * Where a line crosses the edge of the disc (view z = 0) it is cut exactly on the rim.
   * "hidden" says whether any part of the line was cut off.
   */
  function visibleChains(line) {
    const view = line.view;
    const total = view.length;
    let firstHidden = -1;
    let visibleCount = 0;
    for (let i = 0; i < total; i++) {
      if (view[i][2] > 0) visibleCount++;
      else if (firstHidden === -1) firstHidden = i;
    }
    if (visibleCount === total) {
      return { chains: [view.map((v) => toCanvas(v))], hidden: false };
    }
    if (visibleCount === 0) return { chains: [], hidden: true };

    // A closed ring starts at a hidden point, so no piece wraps around the start of the list.
    const start = line.closed ? firstHidden : 0;
    const count = line.closed ? total + 1 : total;
    const chains = [];
    let chain = null;
    let previous = null;
    for (let step = 0; step < count; step++) {
      const current = view[(start + step) % total];
      const currentVisible = current[2] > 0;
      if (previous) {
        const previousVisible = previous[2] > 0;
        if (previousVisible !== currentVisible) {
          const rimPoint = toCanvas(crossingOnRim(previous, current));
          if (currentVisible) {
            chain = [rimPoint];
          } else {
            chain.push(rimPoint);
            chains.push(chain);
            chain = null;
          }
        }
      }
      if (currentVisible) {
        if (!chain) chain = [];
        chain.push(toCanvas(current));
      }
      previous = current;
    }
    if (chain) chains.push(chain);
    return { chains, hidden: true };
  }

  function toCanvas(v) {
    return [side / 2 + radius * v[0], side / 2 - radius * v[1]];
  }

  // Where the straight step from a to b (one in front, one behind) passes through z = 0, pushed onto the rim.
  function crossingOnRim(a, b) {
    const t = a[2] / (a[2] - b[2]);
    const x = a[0] + (b[0] - a[0]) * t;
    const y = a[1] + (b[1] - a[1]) * t;
    const length = Math.hypot(x, y);
    return [x / length, y / length, 0];
  }

  // Clockwise distance (in radians, on screen) from one point of the rim to another.
  function clockwiseSweep(from, to) {
    const centre = side / 2;
    const fromAngle = Math.atan2(from[1] - centre, from[0] - centre);
    const toAngle = Math.atan2(to[1] - centre, to[0] - centre);
    const sweep = (toAngle - fromAngle + TWO_PI) % TWO_PI; // y points down, so clockwise is increasing angle
    return sweep > TWO_PI - 1e-6 ? 0 : sweep;
  }

  /*
   * Fills the visible part of a land ring that was cut by the edge of the globe.
   * Land is always on the right-hand side as you walk along a ring (seen from outside the Earth).
   * So each visible piece of coast ends where it leaves the disc, and the filled shape continues
   * clockwise along the rim until it meets the next place where a piece of coast comes back in.
   * That "next one along the rim" is not always the next piece in the ring's own order,
   * so the exits are matched to the entries by their position on the rim.
   * Without these rim arcs the fill would be cut by a straight line instead of following the globe's edge.
   */
  function addFilledShape(path, chains) {
    const following = chains.map((chain) => {
      const exit = chain[chain.length - 1];
      let best = 0;
      for (let j = 1; j < chains.length; j++) {
        if (clockwiseSweep(exit, chains[j][0]) < clockwiseSweep(exit, chains[best][0])) best = j;
      }
      return best;
    });

    const used = new Array(chains.length).fill(false);
    for (let first = 0; first < chains.length; first++) {
      if (used[first]) continue;
      let index = first;
      let startOfShape = true;
      while (!used[index]) {
        used[index] = true;
        const chain = chains[index];
        for (let k = 0; k < chain.length; k++) {
          if (startOfShape && k === 0) path.moveTo(chain[0][0], chain[0][1]);
          else path.lineTo(chain[k][0], chain[k][1]);
        }
        startOfShape = false;

        const exit = chain[chain.length - 1];
        const next = following[index];
        const sweep = clockwiseSweep(exit, chains[next][0]);
        const from = Math.atan2(exit[1] - side / 2, exit[0] - side / 2);
        const pieces = Math.ceil(sweep / ARC_STEP);
        for (let k = 1; k <= pieces; k++) {
          const angle = from + (sweep * k) / pieces;
          path.lineTo(side / 2 + radius * Math.cos(angle), side / 2 + radius * Math.sin(angle));
        }
        index = next;
      }
      path.closePath();
    }
  }

  function addPolyline(path, chain, close) {
    path.moveTo(chain[0][0], chain[0][1]);
    for (let k = 1; k < chain.length; k++) path.lineTo(chain[k][0], chain[k][1]);
    if (close) path.closePath();
  }

  // ---------- Drawing ----------

  function sparklePath(x, y, r) {
    const k = r * 0.13;
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.quadraticCurveTo(x + k, y - k, x + r, y);
    ctx.quadraticCurveTo(x + k, y + k, x, y + r);
    ctx.quadraticCurveTo(x - k, y + k, x - r, y);
    ctx.quadraticCurveTo(x - k, y - k, x, y - r);
    ctx.closePath();
  }

  function drawSphere(centre) {
    const body = ctx.createRadialGradient(
      centre - radius * 0.32, centre - radius * 0.38, radius * 0.05, centre, centre, radius
    );
    body.addColorStop(0, '#31509f');
    body.addColorStop(0.5, '#182b66');
    body.addColorStop(1, '#0a1239');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(centre, centre, radius, 0, TWO_PI);
    ctx.fill();
  }

  function drawGrid() {
    const path = new Path2D();
    for (const line of gridLines) {
      turnToView(line.vectors, line.view);
      for (const chain of visibleChains(line).chains) addPolyline(path, chain, false);
    }
    ctx.strokeStyle = 'rgba(175, 200, 255, 0.16)';
    ctx.lineWidth = 0.8;
    ctx.stroke(path);
  }

  function drawLand() {
    const fill = new Path2D();
    const coast = new Path2D();
    for (const ring of landRings) {
      turnToView(ring.outline.vectors, ring.outline.view);
      const { chains, hidden } = visibleChains(ring.outline);
      if (chains.length === 0) continue;
      if (!hidden) {
        addPolyline(fill, chains[0], true);
        if (!ring.coastLines) addPolyline(coast, chains[0], true);
      } else {
        // A lake cut by the edge is left unfilled: its fill would have to be "everything except the lake".
        if (!ring.isLake) addFilledShape(fill, chains);
        if (!ring.coastLines) for (const chain of chains) addPolyline(coast, chain, false);
      }
      if (ring.coastLines) {
        for (const line of ring.coastLines) {
          turnToView(line.vectors, line.view);
          for (const chain of visibleChains(line).chains) addPolyline(coast, chain, false);
        }
      }
    }
    ctx.fillStyle = 'rgba(244, 236, 225, 0.13)';
    ctx.fill(fill);
    ctx.strokeStyle = 'rgba(244, 236, 225, 0.88)';
    ctx.lineWidth = 1;
    ctx.lineJoin = 'round';
    ctx.stroke(coast);
  }

  function drawRim(centre) {
    const glow = ctx.createRadialGradient(centre, centre, radius * 0.8, centre, centre, radius);
    glow.addColorStop(0, 'rgba(140, 170, 255, 0)');
    glow.addColorStop(1, 'rgba(140, 170, 255, 0.26)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(centre, centre, radius, 0, TWO_PI);
    ctx.fill();
    ctx.strokeStyle = 'rgba(190, 210, 255, 0.5)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  function pinSize() { return Math.max(6, radius * 0.055); }
  function activePinSize() { return Math.max(10, radius * 0.095); }
  function activeRingRadius() { return Math.max(15, radius * 0.125); }

  function projectPins() {
    for (const pin of places) {
      turnToView([pin.vector], [pin.view]);
      const [x, y] = toCanvas(pin.view);
      pin.x = x;
      pin.y = y;
      pin.z = pin.view[2];
    }
  }

  function smooth(t) { return t * t * (3 - 2 * t); }

  // Moves every pin's level towards 1 (the active pin) or 0 (the others). Returns true while anything is still moving.
  function stepLevels(now) {
    const step = animating ? Math.min(now - lastFrameTime, 50) / EASE_MS : 0;   // the first frame of a change only starts it
    lastFrameTime = now;
    let moving = false;
    places.forEach((pin, index) => {
      const target = index === activeIndex ? 1 : 0;
      if (pin.level === target) return;
      if (reducedMotion.matches) {
        pin.level = target;
        return;
      }
      pin.level = target > pin.level ? Math.min(target, pin.level + step) : Math.max(target, pin.level - step);
      if (pin.level !== target) moving = true;
    });
    return moving;
  }

  function drawPins() {
    ctx.shadowColor = PIN_GLOW;
    ctx.shadowBlur = 9 * pixelRatio;
    places.forEach((pin) => {
      if (pin.z <= PIN_MIN_Z) return;
      const grow = smooth(pin.level);
      ctx.globalAlpha = Math.min(1, (pin.z - PIN_MIN_Z) * 6);
      ctx.fillStyle = PIN_COLOR;
      sparklePath(pin.x, pin.y, pinSize() + (activePinSize() - pinSize()) * grow);
      ctx.fill();
      if (grow > 0) {
        ctx.globalAlpha *= grow;
        ctx.strokeStyle = 'rgba(' + RING_COLOR + ', 0.85)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(pin.x, pin.y, activeRingRadius() * (0.7 + 0.3 * grow), 0, TWO_PI);
        ctx.stroke();
      }
    });
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';
  }

  function draw() {
    drawQueued = false;
    if (side === 0) return;
    const centre = side / 2;
    animating = stepLevels(performance.now());
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    ctx.clearRect(0, 0, side, side);
    drawSphere(centre);
    drawGrid();
    drawLand();
    drawRim(centre);
    projectPins();
    drawPins();
    updateLeader();
    if (animating) requestDraw();   // frames are drawn only while something is changing
  }

  function requestDraw() {
    if (drawQueued) return;
    drawQueued = true;
    requestAnimationFrame(draw);
  }

  // ---------- Caption and leader line ----------

  const captionName = document.getElementById('cap-name');
  const captionYear = document.getElementById('cap-year');
  const captionNote = document.getElementById('cap-note');

  // The place whose text is on the caption (and where the leader line points). It follows the active place
  // after the caption has faded out, so the text never snaps while it can be seen.
  let shownIndex = -1;
  let swapTimer = 0;
  let hiddenSince = -Infinity;

  function showCaption(index) {
    const place = places[index].place;
    captionName.textContent = place.name;
    captionYear.textContent = place.year;
    captionNote.textContent = place.note || '';
    shownIndex = index;
    projectPins();
    updateLeader();
  }

  function setCaptionVisible(visible) {
    if (!visible && caption.classList.contains('visible')) hiddenSince = performance.now();
    caption.classList.toggle('visible', visible);
    leader.classList.toggle('visible', visible);
  }

  function updateCaption() {
    clearTimeout(swapTimer);
    if (activeIndex < 0) {
      setCaptionVisible(false);
      return;
    }
    if (activeIndex === shownIndex) {
      setCaptionVisible(true);
      return;
    }
    const alreadyGone = !caption.classList.contains('visible') && performance.now() - hiddenSince >= FADE_OUT_MS;
    if (shownIndex === -1 || alreadyGone || reducedMotion.matches) {
      showCaption(activeIndex);
      setCaptionVisible(true);
      return;
    }
    setCaptionVisible(false);   // fade out, change the text, fade back in
    swapTimer = setTimeout(() => {
      if (activeIndex < 0) return;
      showCaption(activeIndex);
      setCaptionVisible(true);
    }, FADE_OUT_MS);
  }

  function setActive(index) {
    if (index === activeIndex) return;
    activeIndex = index;
    updateCaption();
    requestDraw();
  }

  // The visible pin nearest the middle of the globe's face (the one facing us most). The current place only
  // gives way to another pin that is clearly nearer, so it does not flicker while two are about equally near.
  function pickActiveFromView() {
    projectPins();
    let best = -1;
    places.forEach((pin, index) => {
      if (pin.z > PIN_MIN_Z && (best === -1 || pin.z > places[best].z)) best = index;
    });
    const current = places[activeIndex];
    if (best !== -1 && current && current.z > PIN_MIN_Z) {
      const away = (pin) => Math.acos(Math.min(1, pin.z));
      if (away(places[best]) > away(current) - SWITCH_MARGIN) best = activeIndex;
    }
    setActive(best);
  }

  // Draws the thin line from the active pin down to the caption.
  function updateLeader() {
    const pin = places[shownIndex];
    if (!pin || pin.z <= PIN_MIN_Z) return;   // the leader is fading out with the caption; leave it where it was
    // All positions are in pixels from the top left of the slot, which is what the leader's svg uses.
    const slotBox = slot.getBoundingClientRect();
    const canvasBox = canvas.getBoundingClientRect();
    const captionBox = caption.getBoundingClientRect();
    const startX = canvasBox.left - slotBox.left + pin.x;
    const startY = canvasBox.top - slotBox.top + pin.y;
    const endX = captionBox.left - slotBox.left + captionBox.width / 2;
    const endY = captionBox.top - slotBox.top - 4;
    const length = Math.hypot(endX - startX, endY - startY) || 1;
    const gap = activeRingRadius() + 3;
    leaderLine.setAttribute('x1', startX + ((endX - startX) / length) * gap);
    leaderLine.setAttribute('y1', startY + ((endY - startY) / length) * gap);
    leaderLine.setAttribute('x2', endX);
    leaderLine.setAttribute('y2', endY);
  }

  // ---------- Turning the globe ----------

  function rotateBy(deltaLon, deltaLat) {
    centerLon = ((centerLon + deltaLon + Math.PI * 3) % TWO_PI) - Math.PI;
    centerLat = Math.max(-MAX_TILT, Math.min(MAX_TILT, centerLat + deltaLat));
    pickActiveFromView();
    requestDraw();
  }

  let pointerId = null;
  let lastX = 0, lastY = 0, lastTime = 0;
  let travelled = 0;
  let speedLon = 0, speedLat = 0;   // radians per millisecond
  let inertiaFrame = 0;

  // One pixel of dragging turns the globe by 1/radius radians, so the point under the finger follows it.
  // Near the poles, east-west distances shrink, so sideways turns get larger there (up to a limit).
  function dragToTurn(dx, dy) {
    const eastWestScale = 1 / Math.max(Math.cos(centerLat), 0.5);
    return [(-dx / radius) * eastWestScale, dy / radius];
  }

  function pinNear(x, y, reach) {
    let best = -1;
    let bestDistance = reach;
    places.forEach((pin, index) => {
      if (pin.z <= PIN_MIN_Z) return;
      const distance = Math.hypot(pin.x - x, pin.y - y);
      if (distance <= bestDistance) {
        best = index;
        bestDistance = distance;
      }
    });
    return best;
  }

  function localPoint(event) {
    const box = canvas.getBoundingClientRect();
    return [event.clientX - box.left, event.clientY - box.top];
  }

  function stopInertia() {
    cancelAnimationFrame(inertiaFrame);
    inertiaFrame = 0;
  }

  function startInertia() {
    let previous = performance.now();
    function step(now) {
      const elapsed = Math.min(now - previous, 50);
      previous = now;
      const decay = Math.exp(-elapsed / INERTIA_MS);
      speedLon *= decay;
      speedLat *= decay;
      if (Math.hypot(speedLon, speedLat) < STOP_SPEED) {
        inertiaFrame = 0;
        return;
      }
      rotateBy(speedLon * elapsed, speedLat * elapsed);
      inertiaFrame = requestAnimationFrame(step);
    }
    inertiaFrame = requestAnimationFrame(step);
  }

  canvas.addEventListener('pointerdown', (event) => {
    if (pointerId !== null || (event.pointerType === 'mouse' && event.button !== 0)) return;
    pointerId = event.pointerId;
    canvas.setPointerCapture(pointerId);
    stopInertia();
    lastX = event.clientX;
    lastY = event.clientY;
    lastTime = event.timeStamp;
    travelled = 0;
    speedLon = speedLat = 0;
    canvas.classList.add('dragging');
  });

  canvas.addEventListener('pointermove', (event) => {
    if (event.pointerId !== pointerId) {
      if (pointerId === null && event.pointerType === 'mouse') {
        const [x, y] = localPoint(event);
        canvas.classList.toggle('on-pin', pinNear(x, y, 16) !== -1);
      }
      return;
    }
    const dx = event.clientX - lastX;
    const dy = event.clientY - lastY;
    const elapsed = Math.max(1, event.timeStamp - lastTime);
    travelled += Math.abs(dx) + Math.abs(dy);
    lastX = event.clientX;
    lastY = event.clientY;
    lastTime = event.timeStamp;
    if (travelled < TAP_MOVE_LIMIT) return;
    const [deltaLon, deltaLat] = dragToTurn(dx, dy);
    speedLon = 0.6 * (deltaLon / elapsed) + 0.4 * speedLon;
    speedLat = 0.6 * (deltaLat / elapsed) + 0.4 * speedLat;
    rotateBy(deltaLon, deltaLat);
  });

  function endPointer(event) {
    if (event.pointerId !== pointerId) return;
    pointerId = null;
    canvas.classList.remove('dragging');
    if (event.type === 'pointercancel') return;

    if (travelled < TAP_MOVE_LIMIT) {
      const [x, y] = localPoint(event);
      const tapped = pinNear(x, y, event.pointerType === 'touch' ? 28 : 18);
      if (tapped !== -1) {
        setActive(tapped);
        requestDraw();
      }
      return;
    }
    const heldStill = event.timeStamp - lastTime > 80;
    if (!heldStill && !reducedMotion.matches) startInertia();
  }
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);

  // ---------- Size ----------

  function resize() {
    const box = canvas.getBoundingClientRect();
    side = box.width;
    radius = side * DISC_SHARE / 2;
    pixelRatio = window.devicePixelRatio || 1;
    canvas.width = Math.round(side * pixelRatio);
    canvas.height = Math.round(side * pixelRatio);
    // Drawn straight away: changing the canvas size clears it, and waiting for the next frame would show a blank globe.
    draw();
  }

  // The leader line is measured between the pin and the caption, so it is measured again whenever the layout
  // moves (the slot or caption changes size, or the fonts finish loading and the columns change width).
  function relayout() {
    if (side === 0) return;
    const box = canvas.getBoundingClientRect();
    if (box.width !== side) resize();
    else updateLeader();
  }

  new ResizeObserver(resize).observe(globeBox);
  const layoutObserver = new ResizeObserver(relayout);
  layoutObserver.observe(slot);
  layoutObserver.observe(caption);
  window.addEventListener('resize', resize);
  window.addEventListener('load', relayout);
  if (document.fonts) {
    document.fonts.addEventListener('loadingdone', relayout);
    document.fonts.ready.then(relayout);
  }
  resize();
  pickActiveFromView();
})();
