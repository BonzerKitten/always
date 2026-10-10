/* Scatters small, quiet stars over the night sky. The positions are fixed, so every visit looks the same. */

(function drawSky() {
  const sky = document.getElementById('sky');
  const STAR_COUNT = 110;

  // A tiny seeded random generator: the same "random" numbers on every load.
  let seed = 20140205;
  function random() {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  }

  const fragment = document.createDocumentFragment();
  for (let i = 0; i < STAR_COUNT; i++) {
    const star = document.createElement('i');
    const size = random() < 0.12 ? 2 : 1;
    star.style.left = random() * 100 + '%';
    star.style.top = random() * 100 + '%';
    star.style.width = star.style.height = size + 'px';
    star.style.opacity = (0.3 + random() * 0.5).toFixed(2);
    if (i % 3 === 0) {
      star.className = 'twinkle';
      star.style.setProperty('--dur', (4 + random() * 6).toFixed(1) + 's');
      star.style.setProperty('--delay', (-random() * 8).toFixed(1) + 's');
      star.style.setProperty('--lo', '0.15');
      star.style.setProperty('--hi', (0.6 + random() * 0.35).toFixed(2));
    }
    fragment.appendChild(star);
  }
  sky.appendChild(fragment);
})();
