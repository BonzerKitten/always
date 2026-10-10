/*
 * Scatters small, quiet stars over the night sky. The positions are fixed, so every visit looks the same.
 * The stars live in a few groups. Each group drifts slowly and twinkles as one layer, at its own pace and phase,
 * so neighbouring stars do not twinkle together (the speeds and strengths are set at the top of style.css).
 */
(function drawSky() {
  const sky = document.getElementById('sky');
  const STAR_COUNT = 110;
  const GROUP_COUNT = 6;

  // A tiny seeded random generator: the same "random" numbers on every load.
  let seed = 20140205;
  function random() {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  }

  const groups = [];
  for (let g = 0; g < GROUP_COUNT; g++) {
    const group = document.createElement('div');
    group.className = 'star-group';
    group.style.setProperty('--dk', (0.85 + random() * 0.3).toFixed(2));    // drift speed: a little different per group
    group.style.setProperty('--dp', random().toFixed(2));                   // where in its drift the group starts
    group.style.setProperty('--tk', (0.65 + random() * 0.7).toFixed(2));    // twinkle pace
    group.style.setProperty('--tp', random().toFixed(2));                   // where in its twinkle the group starts
    groups.push(group);
  }

  // Every star is placed twice, in the left and the right half of its (double wide) group, so the drift can wrap around.
  for (let i = 0; i < STAR_COUNT; i++) {
    const size = random() < 0.12 ? 2 : 1;
    const x = random() * 50;
    const top = random() * 100;
    const opacity = (0.5 + random() * 0.45).toFixed(2);
    const warm = random() < 0.15 ? (random() < 0.5 ? '#ffeec2' : '#ffe08a') : '';   // a few slightly warm stars
    const group = groups[Math.floor(random() * GROUP_COUNT)];
    for (const left of [x, x + 50]) {
      const star = document.createElement('i');
      star.style.left = left.toFixed(3) + '%';
      star.style.top = top.toFixed(3) + '%';
      star.style.width = star.style.height = size + 'px';
      star.style.opacity = opacity;
      if (warm) star.style.background = warm;
      group.appendChild(star);
    }
  }
  for (const group of groups) sky.appendChild(group);
})();
