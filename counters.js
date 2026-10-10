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
}

document.title = SITE.tabTitle;
setText('title', SITE.title);
setText('subtitle', SITE.subtitle);
renderCounters();

// Checked every 30 seconds instead of waiting for midnight: timers can be paused or skipped when a computer
// sleeps or the clock is changed, so a single midnight timer could leave yesterday's numbers on the page.
setInterval(renderCounters, 30000);

// Also refresh the moment the page is shown again.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) renderCounters();
});
