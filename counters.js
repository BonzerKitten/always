/* Writes the title and the counters into the page, and keeps them up to date as days pass. */

function setText(id, text) {
  document.getElementById(id).textContent = text;
}

function renderCounters() {
  const counters = buildCounters(SITE, localToday(new Date()));

  setText('hero-number', counters.hero.number);
  setText('hero-label', counters.hero.label);
  setText('hero-breakdown', counters.hero.breakdown);
  setText('met-number', counters.met.number);
  setText('met-label', counters.met.label);
  setText('anniversary-number', counters.anniversary.number);
  setText('anniversary-label', counters.anniversary.label);
  setText('half-number', counters.half.number);
  setText('half-label', counters.half.label);
  fitHeroNumber();
}

// The big number must never push into the globe. Where it is wider than its column (a narrow window, or one more
// digit some day) it is made just small enough to fit; where it fits, its size is left to the style sheet.
const heroNumber = document.getElementById('hero-number');
function fitHeroNumber() {
  heroNumber.style.fontSize = '';
  const room = heroNumber.clientWidth;
  const wide = heroNumber.scrollWidth;
  if (wide <= room) return;
  const styled = parseFloat(getComputedStyle(heroNumber).fontSize);
  heroNumber.style.fontSize = (styled * (room / wide) * 0.995) + 'px';
}

document.title = SITE.tabTitle;
setText('title', SITE.title);
setText('subtitle', SITE.subtitle);
renderCounters();

// The column changes width with the window, and the number changes width when its font arrives.
new ResizeObserver(fitHeroNumber).observe(heroNumber.parentElement);
if (document.fonts) document.fonts.ready.then(fitHeroNumber);

// Checked every 30 seconds instead of waiting for midnight: timers can be paused or skipped when a computer
// sleeps or the clock is changed, so a single midnight timer could leave yesterday's numbers on the page.
setInterval(renderCounters, 30000);

// Also refresh the moment the page is shown again.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) renderCounters();
});
