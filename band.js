/*
 * Fits the Greek key bands to the screen's real pixels, so every cell is the same whole number of device pixels
 * and every edge is sharp at any zoom level or screen scale. Without this script the bands still draw from the
 * plain CSS in style.css, just not guaranteed sharp everywhere.
 *
 * The one number to change is --cell-target in style.css (the wished cell size in CSS pixels).
 */
(function fitBand() {
  const bands = Array.from(document.querySelectorAll('.meander'));
  if (!bands.length) return;
  const root = document.documentElement;
  const COLOR = '%23ffe9b0';
  const PERIOD = 14;      // cells from one key to the next (13 wide plus one empty column)
  const KEY_PATH = 'M2 3V2H4V5H0V0H6V5H12V0H8V3H10V2';

  // Browsers keep lengths in 64ths of a CSS pixel. A length in device pixels is drawn exactly only when it is a whole
  // number of those 64ths, so tile sizes are chosen that way.
  function isExact(devicePixels, ratio) {
    const x = devicePixels * 64 / ratio;
    return Math.abs(x - Math.round(x)) < 0.01;
  }

  function targetCell() {
    const probe = document.createElement('div');
    probe.style.cssText = 'position:absolute;visibility:hidden;width:var(--cell-target,2px)';
    bands[0].parentNode.appendChild(probe);
    const width = parseFloat(getComputedStyle(probe).width);
    probe.remove();
    return width > 0 ? width : 2;
  }

  function fit() {
    const ratio = window.devicePixelRatio || 1;
    const cell = Math.max(1, Math.round(targetCell() * ratio));   // device pixels per cell

    // Tile width: a whole number of key periods that the browser can draw exactly.
    let repeats = 1;
    while (repeats < 64 && !isExact(repeats * PERIOD * cell, ratio)) repeats++;
    if (!isExact(repeats * PERIOD * cell, ratio)) repeats = 1;
    const tileWidth = repeats * PERIOD * cell;

    // Band height: 10 cells, rounded up to a height the browser can draw exactly.
    let height = 10 * cell;
    while (height < 10 * cell + 16 && !isExact(height, ratio)) height++;
    if (!isExact(height, ratio)) height = 10 * cell;
    root.style.setProperty('--band-h', height / ratio + 'px');
    // Distance from the screen edge: a whole number of cells, so it lands on whole device pixels too.
    const edgeCells = parseFloat(getComputedStyle(root).getPropertyValue('--edge-cells'));
    // The distance is wished to be edgeCells x cell device pixels. A band only sits exactly on whole device pixels when
    // that distance is also a size the browser can lay out exactly, so the nearest such number of device pixels is used
    // (the same number whenever the wish is already exact, a pixel or two off otherwise).
    const wished = Math.max(1, Math.round((isNaN(edgeCells) ? 2 : edgeCells) * cell));
    let edgeDev = wished;
    for (let step = 0; step <= 2 * Math.ceil(ratio) + 2; step++) {
      if (wished - step >= 1 && isExact(wished - step, ratio)) { edgeDev = wished - step; break; }
      if (isExact(wished + step, ratio)) { edgeDev = wished + step; break; }
    }
    root.style.setProperty('--edge', edgeDev / ratio + 'px');

    for (const band of bands) {
      // The last band sits at the bottom edge: its picture is pushed down so the spare rows (if any) are above it.
      const offsetY = band === bands[bands.length - 1] ? height - 10 * cell : 0;
      // The key in the middle of the screen sits in the middle of the band (to within one device pixel).
      const screenWidth = Math.round(band.getBoundingClientRect().width * ratio);
      const firstKey = Math.round(screenWidth / 2 - 6.5 * cell);
      const step = PERIOD * cell;
      const phase = ((firstKey % step) + step) % step;
      let keys = '';
      for (let x = phase - step; x < tileWidth; x += step) {
        keys += "<path transform='translate(" + (x + cell / 2) + ' ' + 2.5 * cell + ') scale(' + cell + ")' stroke-width='1' d='" + KEY_PATH + "'/>";
      }
      const svg = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 " + tileWidth + ' ' + height + "' width='" + tileWidth +
        "' height='" + height + "' fill='none' stroke='" + COLOR.replace('%23', '#') + "' shape-rendering='crispEdges'>" +
        "<g transform='translate(0 " + offsetY + ")'>" +
        "<path stroke-width='" + cell + "' d='M0 " + cell / 2 + 'H' + tileWidth + 'M0 ' + 9.5 * cell + 'H' + tileWidth + "'/>" +
        "<g stroke-linecap='square' stroke-linejoin='miter'>" + keys + '</g></g></svg>';
      band.style.background = 'url("data:image/svg+xml,' + encodeURIComponent(svg) + '") 0 0 / ' +
        tileWidth / ratio + 'px ' + height / ratio + 'px repeat-x';
      band.setAttribute('data-cell', cell);
    }
  }

  let queued = false;
  function fitSoon() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; fit(); });
  }

  // The pixel ratio changes when the page is zoomed or moved to another screen.
  function watchRatio() {
    if (!window.matchMedia) return;
    const query = window.matchMedia('(resolution: ' + (window.devicePixelRatio || 1) + 'dppx)');
    const onChange = () => { fit(); watchRatio(); };
    if (query.addEventListener) query.addEventListener('change', onChange, { once: true });
  }

  fit();
  watchRatio();
  window.addEventListener('resize', fitSoon);
  window.addEventListener('load', fitSoon);
})();
