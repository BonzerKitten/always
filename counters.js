/* Writes the title and the counters into the page, and refreshes them after midnight. */

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

// Runs again a moment after the next local midnight, so a page left open shows the new day.
function scheduleMidnightRefresh() {
  const now = new Date();
  const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
  setTimeout(() => {
    renderCounters();
    scheduleMidnightRefresh();
  }, nextMidnight - now);
}

setText('title', SITE.title);
setText('subtitle', SITE.subtitle);
renderCounters();
scheduleMidnightRefresh();

// Timers can be paused while a phone sleeps or a tab is hidden; check again when the page is shown.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) renderCounters();
});
