// Checks the four counters of dates.js against an independent calculation, for every day of the next 35 years.
// The dates and the wording are read from config.js, so this keeps working when they change. No browser needed.
const fs = require('fs'), vm = require('vm'), path = require('path');
const REPO = path.resolve(__dirname, '..');
const ctx = {}; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(REPO + '/config.js', 'utf8') + '\n' + fs.readFileSync(REPO + '/dates.js', 'utf8') + '\nthis.SITE = SITE; this.buildCounters = buildCounters;', ctx);
const { dates, messages } = ctx.SITE;

// Day numbers by the Julian day formula, which shares nothing with the Date-based code under test.
const dayNumber = (y, m, d) => { const a = Math.floor((14 - m) / 12), yy = y + 4800 - a, mm = m + 12 * a - 3; return d + Math.floor((153 * mm + 2) / 5) + 365 * yy + Math.floor(yy / 4) - Math.floor(yy / 100) + Math.floor(yy / 400) - 32045; };
const fromDayNumber = (J) => { const a = J + 32044, b = Math.floor((4 * a + 3) / 146097), c = a - Math.floor(146097 * b / 4), d = Math.floor((4 * c + 3) / 1461), e = c - Math.floor(1461 * d / 4), m = Math.floor((5 * e + 2) / 153); return { day: e - Math.floor((153 * m + 2) / 5) + 1, month: m + 3 - 12 * Math.floor(m / 10), year: 100 * b + d - 4800 + Math.floor(m / 10) }; };
const of = (date) => dayNumber(date.year, date.month, date.day);
const dots = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const word = (n, pair) => (n === 1 ? pair.one : pair.other);

const birth = of(dates.birth), met = of(dates.met), together = of(dates.together);
const equal = met + (met - birth);   // the day when the time since they met equals the time he had lived before
const show = (t) => { const c = ctx.buildCounters(ctx.SITE, t); return `${t.year}-${t.month}-${t.day}: ${c.hero.number} ${c.hero.label} (${c.hero.breakdown}) | ${c.met.number} ${c.met.label} | ${c.anniversary.number} ${c.anniversary.label} | ${c.half.number} ${c.half.label}`; };
const now = new Date(); const today = { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
console.log('equal day:', JSON.stringify(fromDayNumber(equal)));
console.log('today    ', show(today));
for (const offset of [-1, 0, 1]) console.log('equal' + (offset < 0 ? offset : '+' + offset), show(fromDayNumber(equal + offset)));

let bad = 0, checked = 0;
const fail = (what, t, got, expected) => { bad++; if (bad <= 5) console.log('MISMATCH', what, JSON.stringify(t), JSON.stringify(got), 'expected', JSON.stringify(expected)); };
for (let J = of(today) - 400; J <= of(today) + 365 * 35; J++) {
  const t = fromDayNumber(J); const c = ctx.buildCounters(ctx.SITE, t); checked++;
  if (c.hero.number !== dots(J - together)) fail('days together', t, c.hero.number, dots(J - together));
  if (c.met.number !== dots(J - met)) fail('days since they met', t, c.met.number, dots(J - met));

  let half;
  if (J < equal) half = [dots(equal + 1 - J), word(equal + 1 - J, messages.halfBefore)];
  else if (J === equal) half = [messages.halfToday.big, messages.halfToday.label];
  else half = [dots(J - equal), word(J - equal, messages.halfAfter)];
  if (c.half.number !== half[0] || c.half.label !== half[1]) fail('half of life', t, c.half, half);

  let year = t.year; if (dayNumber(year, dates.together.month, dates.together.day) < J) year++;
  const left = dayNumber(year, dates.together.month, dates.together.day) - J;
  const years = (year - dates.together.year) + ' anos';
  const anniversary = left === 0
    ? [messages.anniversaryToday.big, messages.anniversaryToday.label.replace('{anos}', years)]
    : [dots(left), word(left, messages.anniversary).replace('{anos}', years)];
  if (c.anniversary.number !== anniversary[0] || c.anniversary.label !== anniversary[1]) fail('anniversary', t, c.anniversary, anniversary);
}
console.log('checked', checked, 'days, mismatches:', bad);
process.exit(bad ? 1 : 0);
