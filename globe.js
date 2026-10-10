/*
 * The globe: a canvas drawing of the Earth that the visitor turns by dragging and zooms with the wheel or a pinch.
 * No library. It uses an orthographic projection (the Earth as seen from far away),
 * land outlines from land.js (and, once the visitor zooms in, the finer land-detail.js), and the places listed in config.js.
 *
 * The "lens" is the round area the globe has when it is fully zoomed out. Zooming in makes the planet larger than
 * the lens; everything outside the lens is hidden behind a soft edge, so the page around it stays clean.
 */
(function startGlobe() {
  'use strict';

  const DEG = Math.PI / 180;
  const TWO_PI = Math.PI * 2;

  // The canvas is a little larger than the globe so pins at the edge are not cut off.
  // These two numbers must match the canvas size in style.css (252 units wide, globe 200 units).
  const DISC_SHARE = 200 / 252;

  const MAX_TILT = 75 * DEG;        // how far the globe may tip towards a pole
  const MAX_EDGE_STEP = 2;          // degrees; long map edges are split so they curve with the globe
  const ARC_STEP = 4 * DEG;         // smoothness of the globe's rim when land is cut at the edge
  const PIN_MIN_Z = 0.05;           // a pin must face the viewer at least this much to count as visible
  const TAP_MOVE_LIMIT = 6;         // pixels; moving less than this is a tap, not a drag
  const INERTIA_MS = 420;           // how long the spin takes to fade out after release
  const STOP_SPEED = 0.00002;       // radians per millisecond
  const EASE_MS = 330;              // how long a pin takes to grow into (or out of) the active look
  const FADE_OUT_MS = 220;          // the caption fades out this long before its text changes
  const SWITCH_MARGIN = 0.07;       // another pin must be this much nearer the centre (share of the lens radius) to take over

  // Zooming.
  const ZOOM_CAP = 1000;            // the deepest zoom, whatever the places are
  const ZOOM_FLOOR = 12;            // the deepest zoom is never less than this, even when all places are far apart
  const SEPARATE_AT_MAX_PX = 52;    // at the deepest zoom the two closest places are at least this far apart on screen
  const ZOOM_EASE_MS = 90;          // wheel zooming glides towards its goal; this is the time constant of the glide
  const WHEEL_SPEED = 0.0022;       // zoom (as a power of e) per pixel of wheel movement; one mouse notch is about x1.25
  const PINCH_WHEEL_SPEED = 0.01;   // a trackpad pinch arrives as small wheel steps with the control key held
  const GRID_STEPS = [20, 10, 5, 2, 1, 0.5, 0.2, 0.1, 0.05, 0.02, 0.01, 0.005, 0.002, 0.001];   // degrees between grid lines
  const GRID_SHOW_FROM = 0.1;       // a finer grid fades in when its lines are this far apart (share of the lens width) ...
  const GRID_SHOW_TO = 0.18;        // ... and is fully there at this spacing

  // Grouping. Two places are shown as one group while their pins are closer than the merge distance, and apart again
  // once they are farther than the split distance (the gap between the two keeps a group from flickering at the edge).
  // A pin is about 33 px wide on a big screen and 12 px on a phone, and a fingertip needs about 48 px.
  const GROUP_MERGE_PX = 40;
  const GROUP_SPLIT_PX = 48;
  const GROUP_PIN_SCALE = 1.3;      // a group's pin is a little larger than a single one
  const GROUP_EASE_MS = 380;        // how long a group takes to form or to fall apart
  const GROUP_SPREAD = 0.6;         // tapping a group zooms until its places spread over this share of the lens radius
  const FLY_MIN_MS = 550;           // a tap on a group flies the view there; short hops take this long ...
  const FLY_EXTRA_MS = 450;         // ... and a trip half way round the globe this much more

  // The window onto the planet when zoomed in.
  const FEATHER_SHARE = 0.22;       // width of the soft edge, as a share of the lens radius
  const FEATHER_ZOOM_SPAN = 0.6;    // the soft edge grows from nothing over this much zoom after the minimum
  const RING_FADE_ZOOM_SPAN = 0.4;  // the orbit rings fade out over this much zoom after the minimum
  const HALO_FADE = 0.6;            // the halo around the globe loses this share of its strength

  // Coastline detail: the fine land fades in between these zoom levels, once it has loaded.
  const DETAIL_ZOOM_FROM = 2;
  const DETAIL_ZOOM_TO = 3.5;
  const DETAIL_FADE_MS = 500;

  // Land is cut into short runs of points with a bounding cap, so runs far from the view are skipped quickly.
  const CHUNK_POINTS = 32;
  const CHUNK_REACH = Math.cos(1 * DEG);   // a run also ends when it has wandered this far from where it began
  const CULL_PAD_PX = 4;
  const CHUNK_SAG = 4e-4;                  // a skipped run is replaced by a straight chord, which sags this much (share of the radius)

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

  function clamp(value, low, high) { return Math.max(low, Math.min(high, value)); }
  function smooth(t) { return t * t * (3 - 2 * t); }
  function smoothRange(value, from, to) { return smooth(clamp((value - from) / (to - from), 0, 1)); }

  // ---------- Geometry ----------

  // A point on the globe as a unit vector: x towards (0, 0), y towards (0, 90 east), z towards the north pole.
  function toVector(lonDeg, latDeg) {
    const lon = lonDeg * DEG;
    const lat = latDeg * DEG;
    return [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)];
  }

  const SAME_POINT = 1e-9;

  /*
   * Turns a ring of [lon, lat, lon, lat...] into unit vectors (flat: x, y, z, x, y, z...), adding points along
   * long edges. seam[i] is 1 when the edge leaving point i runs along the 180 degree meridian. Natural Earth
   * cuts land there to fit a flat map, so those edges are needed for the fill but are not coast.
   */
  function ringToPoints(flat) {
    const vec = [];
    const seam = [];
    const count = flat.length / 2;
    for (let i = 0; i < count; i++) {
      const j = (i + 1) % count;
      const lon1 = flat[2 * i], lat1 = flat[2 * i + 1];
      const lon2 = flat[2 * j], lat2 = flat[2 * j + 1];
      const isSeam = Math.abs(lon1) === 180 && Math.abs(lon2) === 180 ? 1 : 0;
      const wrapsAroundPole = Math.abs(lon2 - lon1) > 180; // from lon 180 to -180: the same line on the globe
      const steps = wrapsAroundPole
        ? 1
        : Math.max(1, Math.ceil(Math.max(Math.abs(lon2 - lon1), Math.abs(lat2 - lat1)) / MAX_EDGE_STEP));
      for (let s = 0; s < steps; s++) {
        const t = s / steps;
        const v = toVector(lon1 + (lon2 - lon1) * t, lat1 + (lat2 - lat1) * t);
        const last = seam.length - 1;
        if (last >= 0 && Math.hypot(v[0] - vec[3 * last], v[1] - vec[3 * last + 1], v[2] - vec[3 * last + 2]) < SAME_POINT) {
          seam[last] = isSeam; // the same point twice (lon 180 and -180): keep one
        } else {
          vec.push(v[0], v[1], v[2]);
          seam.push(isSeam);
        }
      }
    }
    const last = seam.length - 1;
    if (last > 0 && Math.hypot(vec[0] - vec[3 * last], vec[1] - vec[3 * last + 1], vec[2] - vec[3 * last + 2]) < SAME_POINT) {
      vec.length -= 3;
      seam.pop();
    }
    return { vec, seam };
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
   * Everything a land ring needs for drawing: its points on the globe, which edges are seam edges, and its bounding
   * caps. A cap is a circle on the globe (centre vector and radius) that holds some points. The ring has one for
   * itself and one for each short run of its points ("chunk"), so far-away parts can be skipped without a look.
   * The ring is turned so that it starts just after a seam edge: a piece of coast never wraps round the start.
   */
  function buildRing(flat) {
    let { vec, seam } = ringToPoints(flat);
    const count = seam.length;
    const firstSeam = seam.indexOf(1);
    const hasSeam = firstSeam !== -1;
    if (hasSeam && firstSeam !== count - 1) {
      const from = firstSeam + 1;
      vec = vec.slice(3 * from).concat(vec.slice(0, 3 * from));
      seam = seam.slice(from).concat(seam.slice(0, from));
    }

    const chunkStart = [0];
    const caps = [];
    let first = 0;
    for (let i = 1; i <= count; i++) {
      const k = 3 * (i % count);
      const wandered = vec[3 * first] * vec[k] + vec[3 * first + 1] * vec[k + 1] + vec[3 * first + 2] * vec[k + 2] < CHUNK_REACH;
      if (i < count && i - first < CHUNK_POINTS && !wandered) continue;
      caps.push(...capOf(vec, first, i, count));
      if (i < count) chunkStart.push(i);
      first = i;
    }
    chunkStart.push(count);

    return {
      count,
      vec: Float64Array.from(vec),
      seam: Uint8Array.from(seam),
      hasSeam,
      isLake: isLakeRing(flat),
      chunkStart: Int32Array.from(chunkStart),
      caps: Float64Array.from(caps),
      cap: capOf(vec, 0, count - 1, count),
    };
  }

  // The circle (around the points' average direction) that holds the points from..to, both included.
  // Returns centre x, y, z, then the radius and its cosine and sine.
  function capOf(vec, from, to, count) {
    let sx = 0, sy = 0, sz = 0;
    for (let i = from; i <= to; i++) {
      const k = 3 * (i % count);
      sx += vec[k]; sy += vec[k + 1]; sz += vec[k + 2];
    }
    const length = Math.hypot(sx, sy, sz);
    if (length < 1e-6) return [1, 0, 0, Math.PI, -1, 0];   // points all around the globe: never skipped
    sx /= length; sy /= length; sz /= length;
    let least = 1;
    for (let i = from; i <= to; i++) {
      const k = 3 * (i % count);
      least = Math.min(least, sx * vec[k] + sy * vec[k + 1] + sz * vec[k + 2]);
    }
    const radius = Math.acos(clamp(least, -1, 1));
    return [sx, sy, sz, radius, Math.cos(radius), Math.sin(radius)];
  }

  const coarseRings = LAND_RINGS.map((flat) => buildRing(flat));

  // The finer land arrives later (see requestDetail), as another set of rings.
  const detail = { state: 'idle', rings: [], fade: 0 };

  // Scratch space for cutting one ring or line at a time, large enough for the longest one, so nothing is
  // allocated for every point of every frame.
  let scratchSize = 0;
  let viewX, viewY, viewZ, edgeSeam;
  function growScratch(rings) {
    const longest = rings.reduce((most, ring) => Math.max(most, ring.count), 130);
    if (longest <= scratchSize) return;
    scratchSize = longest;
    viewX = new Float64Array(longest);
    viewY = new Float64Array(longest);
    viewZ = new Float64Array(longest);
    edgeSeam = new Uint8Array(longest);
  }
  growScratch(coarseRings);

  /*
   * The things a pin can stand for: each place, and each group of places that can be drawn as one pin.
   * The groups come from joining the two closest places first, then the closest of what is left, and so on
   * ("single linkage"). A group's height is the distance at which it falls apart again. Each node knows its
   * children and its parent, so zooming can split a group into its two parts and zooming out can join them again.
   * The places come first in the list (leaves), then the groups; a group always comes after its children.
   */
  function makeNode(members, vector) {
    return {
      members,            // the places inside (indexes into SITE.places)
      vector,             // the middle of those places, as a unit vector
      place: members.length === 1 ? SITE.places[members[0]] : null,
      children: null,     // for a group: the two nodes it was joined from
      parent: -1,
      height: 0,          // for a group: the angle (radians) between its two parts
      view: [0, 0, 0],
      // Filled in on every draw: where the pin is on the canvas and how much it faces us.
      x: 0,
      y: 0,
      z: 0,
      ownX: 0,            // the pin's true position, while x and y may still be sliding towards a group
      ownY: 0,
      merged: false,      // a group is drawn as one pin
      form: 1,            // how formed the node is (0 to 1): easing in and out when groups join and fall apart
      weight: 1,          // how much of the node is shown: its own form, less the form of the group it belongs to
      level: 0,           // 0 = ordinary pin, 1 = fully active (eases between the two)
    };
  }

  function buildNodes() {
    const list = SITE.places.map((place, index) => makeNode([index], toVector(place.lon, place.lat)));
    const leafCount = list.length;
    const pairs = [];
    for (let i = 0; i < leafCount; i++) {
      for (let j = i + 1; j < leafCount; j++) {
        const a = list[i].vector, b = list[j].vector;
        pairs.push([Math.acos(clamp(a[0] * b[0] + a[1] * b[1] + a[2] * b[2], -1, 1)), i, j]);
      }
    }
    pairs.sort((p, q) => p[0] - q[0]);
    const topOf = list.map((_, index) => index);   // for each place: the node it is currently part of
    for (const [angle, i, j] of pairs) {
      const first = topOf[i], second = topOf[j];
      if (first === second) continue;
      const members = list[first].members.concat(list[second].members);
      const sum = [0, 0, 0];
      for (const member of members) for (let k = 0; k < 3; k++) sum[k] += list[member].vector[k];
      const length = Math.hypot(...sum);
      const node = makeNode(members, sum.map((value) => value / length));
      node.children = [first, second];
      node.height = angle;
      list[first].parent = list[second].parent = list.length;
      for (const member of members) topOf[member] = list.length;
      list.push(node);
    }
    return list;
  }

  const nodes = buildNodes();
  const leafCount = SITE.places.length;

  // ---------- View state ----------

  let centerLon = SITE.globeStart.lon * DEG;   // the point of the Earth facing the viewer
  let centerLat = SITE.globeStart.lat * DEG;
  let cosLon = 1, sinLon = 0, cosLat = 1, sinLat = 0;
  let zoom = 1;            // 1 = the whole globe fills the lens; larger = closer
  let zoomGoal = 1;        // where a wheel zoom is gliding to
  let zoomMax = ZOOM_FLOOR;
  let anchor = null;       // while zooming: the spot of the Earth that must stay under the pointer
  let side = 0;            // canvas size in CSS pixels
  let lensRadius = 0;      // radius of the lens in CSS pixels (the globe's radius when fully zoomed out)
  let pixelRatio = 1;
  let activeIndex = -1;
  let drawQueued = false;
  let animating = false;     // something is still moving, so the next frame is needed
  let viewChanged = true;    // the view moved since the active place was last chosen
  let lastFrameTime = 0;
  let groupsSettled = false;
  let groupsChanged = false; // a group formed or fell apart (a little) since the active pin was last chosen

  function planetRadius() { return lensRadius * zoom; }

  function setCenter(lon, lat) {
    centerLon = ((lon + Math.PI * 3) % TWO_PI) - Math.PI;
    centerLat = clamp(lat, -MAX_TILT, MAX_TILT);
    cosLon = Math.cos(centerLon);
    sinLon = Math.sin(centerLon);
    cosLat = Math.cos(centerLat);
    sinLat = Math.sin(centerLat);
    viewChanged = true;
  }

  function setZoom(value) {
    zoom = clamp(value, 1, zoomMax);
    viewChanged = true;
  }
  setCenter(centerLon, centerLat);

  /*
   * Turns the Earth so that (centerLon, centerLat) faces the viewer, and writes the point's position into "out":
   * out[0] is right, out[1] is up, out[2] is towards the viewer.
   * A point is on the visible side exactly when out[2] > 0.
   */
  function turnPoint(x, y, z, out) {
    const towardsCenterMeridian = x * cosLon + y * sinLon;
    out[0] = -x * sinLon + y * cosLon;
    out[1] = z * cosLat - towardsCenterMeridian * sinLat;
    out[2] = z * sinLat + towardsCenterMeridian * cosLat;
  }

  // The view position (right, up, towards the viewer; a unit vector) of the spot of a planet of this radius that is seen
  // "right" and "up" pixels from the middle of the canvas. Beyond the planet's edge it is the nearest point on the edge.
  function spotInView(right, up, radius) {
    let east = right / radius, north = up / radius;
    const reach = Math.hypot(east, north);
    if (reach > 0.9999) {
      east *= 0.9999 / reach;
      north *= 0.9999 / reach;
    }
    return [east, north, Math.sqrt(1 - east * east - north * north)];
  }

  // The point of the Earth (a unit vector) that is seen "right" and "up" pixels from the middle of the canvas.
  function earthAt(right, up, radius) {
    const [east, north, toward] = spotInView(right, up, radius);
    const towardsCenterMeridian = -north * sinLat + toward * cosLat;
    return [
      towardsCenterMeridian * cosLon - east * sinLon,
      towardsCenterMeridian * sinLon + east * cosLon,
      north * cosLat + toward * sinLat,
    ];
  }

  // Turns the globe so that the point of the Earth (a unit vector) is seen "right" and "up" pixels from the middle of the canvas.
  function turnPointTo(point, right, up, radius) {
    const [east, north, toward] = spotInView(right, up, radius);
    const pointLat = Math.asin(clamp(point[2], -1, 1));
    const acrossLon = Math.asin(clamp(east / Math.max(Math.cos(pointLat), 1e-9), -1, 1));   // how far east of the middle the point lies
    const towardsCenterMeridian = Math.cos(pointLat) * Math.cos(acrossLon);
    setCenter(
      Math.atan2(point[1], point[0]) - acrossLon,
      Math.atan2(point[2], towardsCenterMeridian) - Math.atan2(north, toward)
    );
  }

  // ---------- The lens ----------

  // 0 when fully zoomed out (the crisp edge of the globe), up to 1 when the soft edge is fully grown.
  function featherAmount() { return smoothRange(zoom, 1, 1 + FEATHER_ZOOM_SPAN); }
  function featherWidth() { return Math.max(1, FEATHER_SHARE * lensRadius * featherAmount()); }

  // How much of what is drawn at this spot of the canvas is still visible (the soft edge fades it out).
  function lensVisibility(x, y) {
    if (zoom <= 1) return 1;
    const distance = Math.hypot(x - side / 2, y - side / 2);
    return 1 - smoothRange(distance, lensRadius - featherWidth(), lensRadius);
  }

  // Hides everything outside the lens, with a soft edge, by keeping only what lies under a fading circle.
  function applyLens(centre) {
    if (zoom <= 1) return;
    const fade = ctx.createRadialGradient(centre, centre, lensRadius - featherWidth(), centre, centre, lensRadius);
    const STOPS = 8;
    for (let i = 0; i <= STOPS; i++) fade.addColorStop(i / STOPS, 'rgba(0, 0, 0, ' + (1 - smooth(i / STOPS)).toFixed(4) + ')');
    ctx.globalCompositeOperation = 'destination-in';
    ctx.fillStyle = fade;
    ctx.fillRect(0, 0, side, side);
    ctx.globalCompositeOperation = 'source-over';
  }

  // The orbit rings around the globe belong to the whole planet: they fade out as the visitor zooms in.
  // The halo around the globe stays, but softer, so it does not outline the lens.
  let decorationShown = '1/1';
  function updateDecoration() {
    const rings = (1 - smoothRange(zoom, 1, 1 + RING_FADE_ZOOM_SPAN)).toFixed(3);
    const halo = (1 - HALO_FADE * featherAmount()).toFixed(3);
    if (rings + '/' + halo === decorationShown) return;
    decorationShown = rings + '/' + halo;
    globeBox.style.setProperty('--ring-opacity', rings);
    globeBox.style.setProperty('--halo-opacity', halo);
  }

  // ---------- Cutting lines at the edge of the globe ----------

  // What is in view this frame: the circle on the globe (around the view's centre) that the lens can show.
  const cone = { x: 1, y: 0, z: 0, angle: 0, cos: 1, sin: 0 };
  function updateCone() {
    const reach = lensRadius + CULL_PAD_PX + planetRadius() * CHUNK_SAG;
    cone.angle = Math.asin(Math.min(1, reach / planetRadius()));
    cone.cos = Math.cos(cone.angle);
    cone.sin = Math.sin(cone.angle);
    cone.x = cosLat * cosLon;
    cone.y = cosLat * sinLon;
    cone.z = sinLat;
  }

  // True when a cap (centre x, y, z, then radius, cosine and sine) lies wholly outside what is in view.
  function capOutsideView(x, y, z, radius, cosRadius, sinRadius) {
    if (cone.angle + radius >= Math.PI) return false;
    return x * cone.x + y * cone.y + z * cone.z < cone.cos * cosRadius - cone.sin * sinRadius;
  }

  // A chain is a visible piece of a line: canvas positions (x, y, x, y...) and, per point, whether the edge leaving it is a seam edge.
  function newChain() { return { xy: [], seam: [] }; }

  function addToChain(chain, right, up, isSeam) {
    chain.xy.push(side / 2 + planetRadius() * right, side / 2 - planetRadius() * up);
    chain.seam.push(isSeam);
  }

  /*
   * Returns the visible pieces of the line held in the scratch arrays (count points, seen from the viewer).
   * Where a line crosses the edge of the disc (view z = 0) it is cut exactly on the rim.
   * "hidden" says whether any part of the line was cut off.
   */
  function visibleChains(count, closed) {
    let firstHidden = -1;
    let visibleCount = 0;
    for (let i = 0; i < count; i++) {
      if (viewZ[i] > 0) visibleCount++;
      else if (firstHidden === -1) firstHidden = i;
    }
    if (visibleCount === 0) return { chains: [], hidden: true };
    if (visibleCount === count) {
      const chain = newChain();
      for (let i = 0; i < count; i++) addToChain(chain, viewX[i], viewY[i], edgeSeam[i]);
      return { chains: [chain], hidden: false };
    }

    // A closed ring starts at a hidden point, so no piece wraps around the start of the list.
    const start = closed ? firstHidden : 0;
    const steps = closed ? count + 1 : count;
    const chains = [];
    let chain = null;
    let previous = -1;
    for (let step = 0; step < steps; step++) {
      const current = (start + step) % count;
      const currentVisible = viewZ[current] > 0;
      if (previous !== -1) {
        const previousVisible = viewZ[previous] > 0;
        if (previousVisible !== currentVisible) {
          crossingOnRim(previous, current);
          if (currentVisible) {
            chain = newChain();
            addToChain(chain, rimPoint[0], rimPoint[1], edgeSeam[previous]);
          } else {
            addToChain(chain, rimPoint[0], rimPoint[1], 0);
            chains.push(chain);
            chain = null;
          }
        }
      }
      if (currentVisible) {
        if (!chain) chain = newChain();
        addToChain(chain, viewX[current], viewY[current], edgeSeam[current]);
      }
      previous = current;
    }
    if (chain) chains.push(chain);
    return { chains, hidden: true };
  }

  // Where the straight step from point a to point b (one in front, one behind) passes through z = 0, pushed onto the rim.
  const rimPoint = [0, 0];
  function crossingOnRim(a, b) {
    const t = viewZ[a] / (viewZ[a] - viewZ[b]);
    const x = viewX[a] + (viewX[b] - viewX[a]) * t;
    const y = viewY[a] + (viewY[b] - viewY[a]) * t;
    const length = Math.hypot(x, y);
    rimPoint[0] = x / length;
    rimPoint[1] = y / length;
  }

  // Clockwise distance (in radians, on screen) from one point of the rim to another.
  function clockwiseSweep(from, to) {
    const centre = side / 2;
    const fromAngle = Math.atan2(from[1] - centre, from[0] - centre);
    const toAngle = Math.atan2(to[1] - centre, to[0] - centre);
    const sweep = (toAngle - fromAngle + TWO_PI) % TWO_PI; // y points down, so clockwise is increasing angle
    return sweep > TWO_PI - 1e-6 ? 0 : sweep;
  }

  function chainStart(chain) { return [chain.xy[0], chain.xy[1]]; }
  function chainEnd(chain) { return [chain.xy[chain.xy.length - 2], chain.xy[chain.xy.length - 1]]; }

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
      const exit = chainEnd(chain);
      let best = 0;
      for (let j = 1; j < chains.length; j++) {
        if (clockwiseSweep(exit, chainStart(chains[j])) < clockwiseSweep(exit, chainStart(chains[best]))) best = j;
      }
      return best;
    });

    const centre = side / 2;
    const radius = planetRadius();
    const used = new Array(chains.length).fill(false);
    for (let first = 0; first < chains.length; first++) {
      if (used[first]) continue;
      let index = first;
      let startOfShape = true;
      while (!used[index]) {
        used[index] = true;
        const xy = chains[index].xy;
        for (let k = 0; k < xy.length; k += 2) {
          if (startOfShape && k === 0) path.moveTo(xy[0], xy[1]);
          else path.lineTo(xy[k], xy[k + 1]);
        }
        startOfShape = false;

        const exit = chainEnd(chains[index]);
        const next = following[index];
        const sweep = clockwiseSweep(exit, chainStart(chains[next]));
        const from = Math.atan2(exit[1] - centre, exit[0] - centre);
        const pieces = Math.ceil(sweep / ARC_STEP);
        for (let k = 1; k <= pieces; k++) {
          const angle = from + (sweep * k) / pieces;
          path.lineTo(centre + radius * Math.cos(angle), centre + radius * Math.sin(angle));
        }
        index = next;
      }
      path.closePath();
    }
  }

  function addPolyline(path, chain, close) {
    const xy = chain.xy;
    path.moveTo(xy[0], xy[1]);
    for (let k = 2; k < xy.length; k += 2) path.lineTo(xy[k], xy[k + 1]);
    if (close) path.closePath();
  }

  // Adds the coast of a chain, leaving out seam edges. A whole ring without seam edges is closed up.
  function addCoast(path, chain, closed) {
    if (closed && chain.seam.indexOf(1) === -1) {
      addPolyline(path, chain, true);
      return;
    }
    const xy = chain.xy;
    const points = chain.seam.length;
    let drawing = false;
    for (let k = 0; k < (closed ? points : points - 1); k++) {
      if (chain.seam[k]) {
        drawing = false;
        continue;
      }
      const next = (k + 1) % points;
      if (!drawing) {
        path.moveTo(xy[2 * k], xy[2 * k + 1]);
        drawing = true;
      }
      path.lineTo(xy[2 * next], xy[2 * next + 1]);
    }
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

  // The sea. It fills the lens and its shading stays put when zooming, so the view keeps the same look.
  function drawSphere(centre) {
    const body = ctx.createRadialGradient(
      centre - lensRadius * 0.32, centre - lensRadius * 0.38, lensRadius * 0.05, centre, centre, lensRadius
    );
    body.addColorStop(0, '#31509f');
    body.addColorStop(0.5, '#182b66');
    body.addColorStop(1, '#0a1239');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(centre, centre, lensRadius, 0, TWO_PI);
    ctx.fill();
  }

  /*
   * The faint grid of meridians (lines from pole to pole) and parallels (circles). Several grids are layered,
   * each twice or so finer than the one before: a finer grid fades in once its lines are far enough apart, so
   * a few lines always cross the lens. A line that belongs to a coarser grid is drawn only by that one.
   */
  function drawGrid() {
    const lensWidth = 2 * lensRadius;
    GRID_STEPS.forEach((step, level) => {
      const spacing = planetRadius() * step * DEG;
      const opacity = level === 0 ? 1 : smoothRange(spacing / lensWidth, GRID_SHOW_FROM, GRID_SHOW_TO);
      if (opacity <= 0) return;
      const path = new Path2D();
      addMeridians(path, step, level);
      addParallels(path, step, level);
      ctx.strokeStyle = 'rgba(175, 200, 255, ' + (0.16 * opacity).toFixed(4) + ')';
      ctx.lineWidth = 0.8;
      ctx.stroke(path);
    });
  }

  function belongsToCoarserGrid(degrees, level) {
    for (let k = 0; k < level; k++) {
      const times = degrees / GRID_STEPS[k];
      if (Math.abs(times - Math.round(times)) < 1e-6) return true;
    }
    return false;
  }

  const gridPoint = [0, 0, 0];

  // Puts a point of a grid line (longitude and latitude in degrees) into the scratch arrays, seen from the viewer.
  function setGridPoint(index, lonDeg, latDeg) {
    const lat = latDeg * DEG, lon = lonDeg * DEG;
    turnPoint(Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat), gridPoint);
    viewX[index] = gridPoint[0];
    viewY[index] = gridPoint[1];
    viewZ[index] = gridPoint[2];
    edgeSeam[index] = 0;
  }

  function addGridLine(path, count, closed) {
    for (const chain of visibleChains(count, closed).chains) addPolyline(path, chain, false);
  }

  function addMeridians(path, step, level) {
    const wholeGlobe = cone.angle >= Math.PI / 2;
    const reachesPole = Math.abs(centerLat) + cone.angle >= Math.PI / 2;
    const across = wholeGlobe || reachesPole ? Math.PI : Math.asin(Math.min(1, cone.sin / cosLat));   // how far east and west the view reaches
    let first, last;
    if (across >= Math.PI) {
      first = Math.ceil(-180 / step);
      last = Math.ceil(180 / step) - 1;
    } else {
      first = Math.ceil((centerLon - across) / DEG / step - 1e-9);
      last = Math.floor((centerLon + across) / DEG / step + 1e-9);
    }
    for (let i = first; i <= last; i++) {
      const lon = i * step;
      if (level > 0 && belongsToCoarserGrid(lon, level)) continue;
      let low = -90, high = 90;
      if (!wholeGlobe) {
        // The latitudes of this meridian that are in view: where it passes through the circle in view.
        const along = cosLat * Math.cos(lon * DEG - centerLon);
        const reach = Math.hypot(along, sinLat);
        if (cone.cos > reach) continue;
        const middle = Math.atan2(sinLat, along) / DEG;
        const half = Math.acos(cone.cos / reach) / DEG;
        low = Math.max(-90, middle - half);
        high = Math.min(90, middle + half);
      }
      const pieces = Math.max(8, Math.ceil((high - low) / 3));
      for (let k = 0; k <= pieces; k++) setGridPoint(k, lon, low + ((high - low) * k) / pieces);
      addGridLine(path, pieces + 1, false);
    }
  }

  function addParallels(path, step, level) {
    const wholeGlobe = cone.angle >= Math.PI / 2;
    const first = Math.ceil((wholeGlobe ? -90 : (centerLat - cone.angle) / DEG) / step - 1e-9);
    const last = Math.floor((wholeGlobe ? 90 : (centerLat + cone.angle) / DEG) / step + 1e-9);
    for (let i = first; i <= last; i++) {
      const lat = i * step;
      if (Math.abs(lat) >= 90 || (level > 0 && belongsToCoarserGrid(lat, level))) continue;
      // The longitudes of this parallel that are in view.
      let across = Math.PI;
      if (!wholeGlobe) {
        const ratio = (cone.cos - Math.sin(lat * DEG) * sinLat) / (Math.cos(lat * DEG) * cosLat);
        if (ratio >= 1) continue;
        if (ratio > -1) across = Math.acos(ratio);
      }
      if (across >= Math.PI) {
        for (let k = 0; k < 120; k++) setGridPoint(k, -180 + 3 * k, lat);
        addGridLine(path, 120, true);
      } else {
        const west = (centerLon - across) / DEG;
        const pieces = Math.max(8, Math.ceil((2 * across) / DEG / 3));
        for (let k = 0; k <= pieces; k++) setGridPoint(k, west + ((2 * across) / DEG * k) / pieces, lat);
        addGridLine(path, pieces + 1, false);
      }
    }
  }

  // How much of the detailed land to show: none until it has loaded, then it takes over as the visitor zooms in.
  function detailShare() {
    return detail.state === 'ready' ? smoothRange(zoom, DETAIL_ZOOM_FROM, DETAIL_ZOOM_TO) * smooth(detail.fade) : 0;
  }

  function drawLand() {
    const share = detailShare();
    if (share < 1) drawLandSet(coarseRings, 1 - share);
    if (share > 0) drawLandSet(detail.rings, share);
  }

  function drawLandSet(rings, opacity) {
    const fill = new Path2D();
    const coast = new Path2D();
    for (const ring of rings) {
      if (ring.cap[3] < 85 * DEG && capOutsideView(...ring.cap)) continue;
      const { chains, hidden } = cutRing(ring);
      if (chains.length === 0) continue;
      if (!hidden) {
        addPolyline(fill, chains[0], true);
        addCoast(coast, chains[0], true);
      } else {
        // A lake cut by the edge is left unfilled: its fill would have to be "everything except the lake".
        if (!ring.isLake) addFilledShape(fill, chains);
        for (const chain of chains) addCoast(coast, chain, false);
      }
    }
    ctx.globalAlpha = opacity;
    ctx.fillStyle = 'rgba(244, 236, 225, 0.13)';
    ctx.fill(fill);
    ctx.strokeStyle = 'rgba(244, 236, 225, 0.88)';
    ctx.lineWidth = 1;
    ctx.lineJoin = 'round';
    ctx.stroke(coast);
    ctx.globalAlpha = 1;
  }

  // Turns a ring and cuts it at the edge of the globe. A run of points far outside the view is replaced by one straight step.
  function cutRing(ring) {
    const { vec, seam, chunkStart, caps } = ring;
    const chunks = chunkStart.length - 1;
    let count = 0;
    for (let c = 0; c < chunks; c++) {
      const start = chunkStart[c];
      const o = 6 * c;
      const near = !capOutsideView(caps[o], caps[o + 1], caps[o + 2], caps[o + 3], caps[o + 4], caps[o + 5]);
      const stop = near ? chunkStart[c + 1] : start + 1;
      for (let i = start; i < stop; i++) {
        const x = vec[3 * i], y = vec[3 * i + 1], z = vec[3 * i + 2];
        const towardsCenterMeridian = x * cosLon + y * sinLon;
        viewX[count] = -x * sinLon + y * cosLon;
        viewY[count] = z * cosLat - towardsCenterMeridian * sinLat;
        viewZ[count] = z * sinLat + towardsCenterMeridian * cosLat;
        edgeSeam[count] = near ? seam[i] : 0;
        count++;
      }
    }
    return visibleChains(count, true);
  }

  // The globe's crisp rim and the glow just inside it. They melt away as the soft edge grows.
  function drawRim(centre) {
    ctx.globalAlpha = 1 - featherAmount();
    const glow = ctx.createRadialGradient(centre, centre, lensRadius * 0.8, centre, centre, lensRadius);
    glow.addColorStop(0, 'rgba(140, 170, 255, 0)');
    glow.addColorStop(1, 'rgba(140, 170, 255, 0.26)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(centre, centre, lensRadius, 0, TWO_PI);
    ctx.fill();
    ctx.strokeStyle = 'rgba(190, 210, 255, 0.5)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // Pins keep their size when zooming: they are sized by the lens, not by the planet.
  function pinSize() { return Math.max(6, lensRadius * 0.055); }
  function activePinSize() { return Math.max(10, lensRadius * 0.095); }
  function activeRingRadius() { return Math.max(15, lensRadius * 0.125); }
  function countSize() { return Math.max(13, Math.round(lensRadius * 0.06)); }

  // Groups join (or fall apart) when the gap between their two parts, as drawn, crosses the merge or split distance.
  // The two distances differ, so a gap hovering around one of them does not make the group flicker.
  function updateMerges() {
    for (let i = leafCount; i < nodes.length; i++) {
      const node = nodes[i];
      const gap = node.height * planetRadius();
      if (!node.merged && gap < GROUP_MERGE_PX) node.merged = true;
      else if (node.merged && gap > GROUP_SPLIT_PX) node.merged = false;
    }
    for (let i = nodes.length - 1; i >= leafCount; i--) {   // inside a joined group, every smaller group is joined too
      if (!nodes[i].merged) continue;
      for (const child of nodes[i].children) nodes[child].merged = true;
    }
  }

  // Works out where every node's pin is drawn and how much of it shows. A group that is forming draws its parts
  // sliding towards each other while they fade into the group's own pin.
  function projectPins() {
    const centre = side / 2;
    nodes.forEach((node) => {
      turnPoint(node.vector[0], node.vector[1], node.vector[2], node.view);
      node.ownX = centre + planetRadius() * node.view[0];
      node.ownY = centre - planetRadius() * node.view[1];
      node.z = node.view[2];
    });
    for (let i = nodes.length - 1; i >= 0; i--) {   // groups before the parts they hold
      const node = nodes[i];
      const group = nodes[node.parent];
      const joined = group ? smooth(group.form) : 0;
      node.x = group ? node.ownX + (group.x - node.ownX) * joined : node.ownX;
      node.y = group ? node.ownY + (group.y - node.ownY) * joined : node.ownY;
      node.weight = smooth(node.form) * (1 - joined);
    }
  }

  // Moves every node's level towards 1 (the active node) or 0 (the others), and every group's form towards
  // 1 (joined) or 0 (apart). Returns true while anything is still moving.
  function stepNodes(step) {
    let moving = false;
    const approach = (value, target, amount) => {
      if (value === target) return value;
      if (reducedMotion.matches) return target;
      const next = target > value ? Math.min(target, value + amount) : Math.max(target, value - amount);
      if (next !== target) moving = true;
      return next;
    };
    nodes.forEach((node, index) => {
      node.level = approach(node.level, index === activeIndex ? 1 : 0, step);
      if (index < leafCount) return;
      const before = node.form;
      node.form = approach(node.form, node.merged ? 1 : 0, step * EASE_MS / GROUP_EASE_MS);
      if (node.form !== before) groupsChanged = true;
    });
    return moving;
  }

  function drawPins() {
    ctx.shadowColor = PIN_GLOW;
    ctx.shadowBlur = 9 * pixelRatio;
    nodes.forEach((node) => {
      if (node.z <= PIN_MIN_Z || node.weight <= 0.002) return;
      const grow = smooth(node.level);
      const isGroup = node.children !== null;
      const shown = node.weight;
      const scale = (0.7 + 0.3 * shown) * (isGroup ? GROUP_PIN_SCALE : 1);
      const size = (pinSize() + (activePinSize() - pinSize()) * grow) * scale;
      ctx.globalAlpha = Math.min(1, (node.z - PIN_MIN_Z) * 6) * shown;
      ctx.fillStyle = PIN_COLOR;
      sparklePath(node.x, node.y, size);
      ctx.fill();
      if (isGroup) drawCount(node, size + (activeRingRadius() * (0.7 + 0.3 * grow) - size) * grow);
      if (grow > 0) {
        ctx.globalAlpha *= grow;
        ctx.strokeStyle = 'rgba(' + RING_COLOR + ', 0.85)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(node.x, node.y, activeRingRadius() * (0.7 + 0.3 * grow), 0, TWO_PI);
        ctx.stroke();
      }
    });
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';
  }

  // The number of places in a group, to the right of its pin (and of its ring, once it is the active one).
  function drawCount(node, reach) {
    ctx.save();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ffeeba';
    ctx.font = '300 ' + countSize() + 'px Jura, "Century Gothic", "Trebuchet MS", sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(node.members.length), node.x + reach + 4, node.y + 0.5);
    ctx.restore();
  }

  function draw() {
    drawQueued = false;
    if (side === 0) return;
    const centre = side / 2;
    const now = performance.now();
    const elapsed = animating ? Math.min(now - lastFrameTime, 50) : 0;   // the first frame of a change only starts it
    lastFrameTime = now;

    let moving = stepCamera(animating ? elapsed : 16);
    updateCone();
    updateMerges();
    if (!groupsSettled) {   // the first picture starts with the groups already formed, not forming
      groupsSettled = true;
      for (const node of nodes) if (node.children) node.form = node.merged ? 1 : 0;
    }
    moving = stepNodes(elapsed / EASE_MS) || moving;
    projectPins();
    if ((viewChanged || groupsChanged) && !flight) {
      viewChanged = groupsChanged = false;
      pickActiveFromView();
    }
    if (detail.state === 'ready' && detail.fade < 1) {
      detail.fade = reducedMotion.matches ? 1 : Math.min(1, detail.fade + elapsed / DETAIL_FADE_MS);
      moving = true;
    }
    animating = moving;

    updateDecoration();
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    ctx.clearRect(0, 0, side, side);
    drawSphere(centre);
    drawGrid();
    drawLand();
    drawRim(centre);
    drawPins();
    applyLens(centre);
    updateLeader();
    if (animating) requestDraw();   // frames are drawn only while something is changing
  }

  function requestDraw() {
    if (drawQueued) return;
    drawQueued = true;
    requestAnimationFrame(draw);
  }

  // ---------- Fine land, loaded when the visitor first zooms ----------

  // The detailed outlines are a separate file, added to the page as a script (a plain request would not work from disk).
  // Until it has arrived, or if it never does, the coarse outlines are used.
  function requestDetail() {
    if (detail.state !== 'idle') return;
    detail.state = 'loading';
    const script = document.createElement('script');
    script.src = 'land-detail.js';
    script.onload = () => {
      if (typeof LAND_DETAIL === 'undefined') {
        detail.state = 'failed';
        return;
      }
      detail.rings = LAND_DETAIL.map((ring) => buildRing(decodeDetailRing(ring)));
      growScratch(detail.rings);
      detail.state = 'ready';
      requestDraw();
    };
    script.onerror = () => { detail.state = 'failed'; };
    document.head.appendChild(script);
  }

  // Detail rings are stored as whole thousandths of a degree: the first point, then the step to each next point.
  function decodeDetailRing(ring) {
    const flat = new Array(ring.length);
    let lon = ring[0], lat = ring[1];
    flat[0] = lon / 1000;
    flat[1] = lat / 1000;
    for (let i = 2; i < ring.length; i += 2) {
      lon += ring[i];
      lat += ring[i + 1];
      flat[i] = lon / 1000;
      flat[i + 1] = lat / 1000;
    }
    return flat;
  }

  // ---------- Camera ----------

  // The deepest zoom: deep enough to pull the two closest places apart, but never beyond a sensible limit.
  function zoomLimit() {
    let closest = Infinity;
    for (let i = 0; i < leafCount; i++) {
      for (let j = i + 1; j < leafCount; j++) {
        const a = nodes[i].vector, b = nodes[j].vector;
        const apart = Math.acos(clamp(a[0] * b[0] + a[1] * b[1] + a[2] * b[2], -1, 1));
        if (apart > 1e-6) closest = Math.min(closest, apart);   // places on the very same spot cannot be pulled apart
      }
    }
    return clamp(SEPARATE_AT_MAX_PX / (closest * lensRadius), ZOOM_FLOOR, ZOOM_CAP);
  }

  /*
   * Tapping a group turns and zooms the globe to it, so that the places it holds spread out over the lens: far
   * enough in for them to span GROUP_SPREAD of the lens, and at least far enough for the group to fall apart.
   * The camera glides there (a "flight"), and the active pin is chosen again when it lands.
   */
  let flight = null;
  function flyToGroup(group) {
    const [x, y, z] = group.vector;
    let reach = 0;
    for (const member of group.members) {
      const v = nodes[member].vector;
      reach = Math.max(reach, Math.acos(clamp(x * v[0] + y * v[1] + z * v[2], -1, 1)));
    }
    const spreadZoom = GROUP_SPREAD / Math.max(Math.sin(reach), 1e-9);
    const splitZoom = (GROUP_SPLIT_PX * 1.1) / Math.max(group.height * lensRadius, 1e-9);
    const goal = clamp(Math.max(spreadZoom, splitZoom), zoom, zoomMax);
    const lon = Math.atan2(y, x);
    const lat = Math.asin(clamp(z, -1, 1));
    const turn = Math.acos(clamp(cosLat * cosLon * x + cosLat * sinLon * y + sinLat * z, -1, 1));
    requestDetail();
    stopInertia();
    anchor = null;
    zoomGoal = goal;
    if (reducedMotion.matches) {
      setCenter(lon, lat);
      setZoom(goal);
      return;
    }
    flight = {
      fromLon: centerLon,
      lonTurn: ((lon - centerLon + Math.PI * 3) % TWO_PI) - Math.PI,   // the short way round
      fromLat: centerLat,
      toLat: lat,
      fromZoom: zoom,
      goal,
      time: 0,
      duration: FLY_MIN_MS + FLY_EXTRA_MS * Math.min(1, turn / (Math.PI / 2)),
    };
  }

  // Moves the camera for one frame (a flight, or a wheel zoom gliding to its goal). Returns true while it is still moving.
  function stepCamera(elapsed) {
    if (flight) {
      flight.time += elapsed;
      const done = Math.min(1, flight.time / flight.duration);
      const along = smooth(done);
      setCenter(flight.fromLon + flight.lonTurn * along, flight.fromLat + (flight.toLat - flight.fromLat) * along);
      setZoom(flight.fromZoom * Math.pow(flight.goal / flight.fromZoom, along));
      if (done === 1) flight = null;
      return flight !== null;
    }
    if (zoom === zoomGoal) return false;
    const gap = Math.log(zoomGoal / zoom);
    if (reducedMotion.matches || Math.abs(gap) < 0.002) {
      setZoom(zoomGoal);
    } else {
      setZoom(zoom * Math.exp(gap * (1 - Math.exp(-elapsed / ZOOM_EASE_MS))));
    }
    if (anchor) turnPointTo(anchor.point, anchor.right, anchor.up, planetRadius());
    if (zoom === zoomGoal) anchor = null;
    return zoom !== zoomGoal;
  }

  // ---------- Caption and leader line ----------

  const captionName = document.getElementById('cap-name');
  const captionYear = document.getElementById('cap-year');
  const captionNote = document.getElementById('cap-note');
  const captionWhen = document.getElementById('cap-when');

  // The place whose text is on the caption (and where the leader line points). It follows the active place
  // after the caption has faded out, so the text never snaps while it can be seen.
  let shownIndex = -1;
  let swapTimer = 0;
  let hiddenSince = -Infinity;

  // "outubro de 2021", or just "2021" for a place with a year only.
  function describeDate(place) {
    const texts = SITE.placeTexts;
    if (!place.month) return String(place.year);
    return texts.monthAndYear.replace('{mês}', texts.months[place.month - 1]).replace('{ano}', place.year);
  }

  // A place shows its name, date and note. A group says how many places it holds and asks the visitor to zoom in.
  function showCaption(index) {
    const node = nodes[index];
    const place = node.place;
    const texts = SITE.placeTexts.group;
    const count = node.members.length;
    captionName.textContent = place ? place.name : pluralWord(count, texts.one, texts.other).replace('{n}', count);
    captionWhen.hidden = !place;
    captionYear.textContent = place ? describeDate(place) : '';
    captionNote.textContent = place ? place.note || '' : texts.hint;
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

  // A pin counts as visible when it faces us, is at least "minimum" formed (see the groups) and is not hidden by the lens edge.
  function pinShown(pin, minimum) {
    return pin.z > PIN_MIN_Z && pin.weight >= minimum && lensVisibility(pin.x, pin.y) >= minimum;
  }

  // The visible pin nearest the middle of the lens. The current place only gives way to another pin that is
  // clearly nearer, so it does not flicker while two are about equally near.
  function pickActiveFromView() {
    const centre = side / 2;
    const away = (pin) => Math.hypot(pin.x - centre, pin.y - centre);
    let best = -1;
    nodes.forEach((pin, index) => {
      if (pinShown(pin, 0.5) && (best === -1 || away(pin) < away(nodes[best]))) best = index;
    });
    const current = nodes[activeIndex];
    if (best !== -1 && current && pinShown(current, 0.15)) {
      if (away(nodes[best]) > away(current) - SWITCH_MARGIN * lensRadius) best = activeIndex;
    }
    setActive(best);
  }

  // Draws the thin line from the active pin down to the caption.
  function updateLeader() {
    const pin = nodes[shownIndex];
    if (!pin || pin.z <= PIN_MIN_Z) return;   // the leader is fading out with the caption; leave it where it was
    leader.classList.toggle('hidden-pin', !pinShown(pin, 0.1));   // the pin is out of the lens or inside a group: no line to it
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

  // ---------- Turning and zooming by hand ----------

  function rotateBy(deltaLon, deltaLat) {
    setCenter(centerLon + deltaLon, centerLat + deltaLat);
    requestDraw();
  }

  const touches = new Map();     // the fingers (or the mouse button) now down: pointer id -> { x, y } in client pixels
  let dragId = null;             // the pointer that is turning the globe
  let pinch = null;              // while two fingers are down: the zoom and the spot of the Earth they started on
  let lastX = 0, lastY = 0, lastTime = 0;
  let travelled = 0;
  let wasPinched = false;        // two fingers were down during this touch, so it is not a tap
  let speedLon = 0, speedLat = 0;   // radians per millisecond
  let inertiaFrame = 0;

  // One pixel of dragging turns the globe by 1/radius radians, so the point under the finger follows it
  // (and the turning slows down as the visitor zooms in).
  // Near the poles, east-west distances shrink, so sideways turns get larger there (up to a limit).
  function dragToTurn(dx, dy) {
    const eastWestScale = 1 / Math.max(Math.cos(centerLat), 0.5);
    return [(-dx / planetRadius()) * eastWestScale, dy / planetRadius()];
  }

  function pinNear(x, y, reach) {
    let best = -1;
    let bestDistance = reach;
    nodes.forEach((pin, index) => {
      if (!pinShown(pin, 0.5)) return;
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

  // Remembers the spot of the Earth under a canvas position, so that zooming can keep it there.
  function grab(x, y) {
    const right = x - side / 2, up = side / 2 - y;
    return { point: earthAt(right, up, planetRadius()), right, up };
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

  function startDrag(id, x, y, time) {
    dragId = id;
    lastX = x;
    lastY = y;
    lastTime = time;
    travelled = 0;
    speedLon = speedLat = 0;
    canvas.classList.add('dragging');
  }

  // The distance between the two fingers and the point halfway between them.
  function fingerGap() {
    const [a, b] = [...touches.values()];
    return { distance: Math.hypot(a.x - b.x, a.y - b.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  canvas.addEventListener('pointerdown', (event) => {
    if (touches.size >= 2 || (event.pointerType === 'mouse' && event.button !== 0)) return;
    canvas.setPointerCapture(event.pointerId);
    touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
    stopInertia();
    zoomGoal = zoom;   // a gesture takes over from a wheel zoom or a flight still going
    anchor = null;
    flight = null;
    if (touches.size === 1) {
      wasPinched = false;
      startDrag(event.pointerId, event.clientX, event.clientY, event.timeStamp);
      return;
    }
    // A second finger: turning gives way to pinching, which zooms and moves about the midpoint of the fingers.
    wasPinched = true;
    dragId = null;
    requestDetail();
    const gap = fingerGap();
    const box = canvas.getBoundingClientRect();
    pinch = { zoom, distance: Math.max(gap.distance, 1), spot: grab(gap.x - box.left, gap.y - box.top) };
  });

  canvas.addEventListener('pointermove', (event) => {
    const touch = touches.get(event.pointerId);
    if (!touch) {
      if (touches.size === 0 && event.pointerType === 'mouse') {
        const [x, y] = localPoint(event);
        canvas.classList.toggle('on-pin', pinNear(x, y, 16) !== -1);
      }
      return;
    }
    touch.x = event.clientX;
    touch.y = event.clientY;

    if (pinch) {
      const gap = fingerGap();
      const box = canvas.getBoundingClientRect();
      setZoom(pinch.zoom * (gap.distance / pinch.distance));
      zoomGoal = zoom;
      turnPointTo(pinch.spot.point, gap.x - box.left - side / 2, side / 2 - (gap.y - box.top), planetRadius());
      requestDraw();
      return;
    }

    if (event.pointerId !== dragId) return;
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
    if (!touches.delete(event.pointerId)) return;
    if (pinch) {
      // One finger is left: it carries on turning the globe, without a tap or a spin at the end.
      pinch = null;
      const rest = [...touches.entries()][0];
      if (rest) {
        startDrag(rest[0], rest[1].x, rest[1].y, event.timeStamp);
        travelled = TAP_MOVE_LIMIT;
      }
      return;
    }
    if (event.pointerId !== dragId) return;
    dragId = null;
    canvas.classList.remove('dragging');
    if (event.type === 'pointercancel') return;

    if (travelled < TAP_MOVE_LIMIT && !wasPinched) {
      const [x, y] = localPoint(event);
      const tapped = pinNear(x, y, event.pointerType === 'touch' ? 28 : 18);
      if (tapped !== -1) {
        setActive(tapped);
        if (nodes[tapped].children) flyToGroup(nodes[tapped]);
        requestDraw();
      }
      return;
    }
    const heldStill = event.timeStamp - lastTime > 80;
    if (!heldStill && !reducedMotion.matches && !wasPinched) startInertia();
  }
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);

  // The wheel zooms towards the pointer; so does a trackpad pinch (a wheel with the control key held).
  // Over the globe these never scroll or zoom the page.
  canvas.addEventListener('wheel', (event) => {
    event.preventDefault();
    const pixels = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 300 : 1);
    const change = clamp(-pixels * (event.ctrlKey ? PINCH_WHEEL_SPEED : WHEEL_SPEED), -1, 1);
    const goal = clamp(zoomGoal * Math.exp(change), 1, zoomMax);
    if (goal === zoomGoal) return;
    if (goal > 1) requestDetail();
    stopInertia();
    flight = null;
    zoomGoal = goal;
    const [x, y] = localPoint(event);
    anchor = grab(x, y);
    requestDraw();
  }, { passive: false });

  // ---------- Size ----------

  function resize() {
    const box = canvas.getBoundingClientRect();
    side = box.width;
    lensRadius = side * DISC_SHARE / 2;
    pixelRatio = window.devicePixelRatio || 1;
    canvas.width = Math.round(side * pixelRatio);
    canvas.height = Math.round(side * pixelRatio);
    zoomMax = zoomLimit();
    zoomGoal = Math.min(zoomGoal, zoomMax);
    setZoom(zoom);
    // Drawn straight away: changing the canvas size clears it, and waiting for the next frame would show a blank globe.
    draw();
  }

  // The leader line is measured between the pin and the caption, so it is measured again whenever the layout
  // moves (the slot or caption changes size, or the fonts finish loading and the columns change width).
  function relayout() {
    if (side === 0) return;
    const box = canvas.getBoundingClientRect();
    if (box.width !== side) {
      resize();
    } else {
      updateLeader();
      requestDraw();   // the count on a group is drawn in the page's label font, which may only just have arrived
    }
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
})();
