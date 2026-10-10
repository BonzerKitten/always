/*
 * Date maths for the counters. Nothing here touches the page or the clock:
 * every function gets "today" as an argument, so it gives the same answer anywhere.
 *
 * A calendar day is a plain object { year, month, day } with month 1 to 12.
 * Days are counted by calendar date only (via UTC), so time zones and daylight
 * saving time can never add or remove a day.
 */

const MS_PER_DAY = 86400000;

function dayNumber(date) {
  return Math.round(Date.UTC(date.year, date.month - 1, date.day) / MS_PER_DAY);
}

function daysBetween(from, to) {
  return dayNumber(to) - dayNumber(from);
}

function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

// Adds whole months; a day that does not exist in the target month (31 Jan + 1 month) becomes its last day.
function addMonths(date, months) {
  const total = date.year * 12 + (date.month - 1) + months;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  return { year, month, day: Math.min(date.day, daysInMonth(year, month)) };
}

// Years, months and days from start up to today, e.g. { years: 12, months: 8, days: 5 }.
function elapsedParts(start, today) {
  let months = (today.year - start.year) * 12 + (today.month - start.month);
  if (daysBetween(addMonths(start, months), today) < 0) months -= 1;
  return {
    years: Math.floor(months / 12),
    months: months % 12,
    days: daysBetween(addMonths(start, months), today),
  };
}

// The anniversary in a given year; a 29 February moves to 28 February in years without one.
function anniversaryIn(start, year) {
  return { year, month: start.month, day: Math.min(start.day, daysInMonth(year, start.month)) };
}

// The next anniversary on or after today: its number (13 for the 13th) and its date.
function nextAnniversary(start, today) {
  let number = today.year - start.year;
  if (daysBetween(today, anniversaryIn(start, start.year + number)) < 0) number += 1;
  return { number, date: anniversaryIn(start, start.year + number) };
}

// How today stands against the "equal day": the day when the time since you met equals
// the time he had lived before meeting you. Returns before, today or after, and how many days apart.
function halfOfLifeStatus(met, birth, today) {
  const equalDayNumber = dayNumber(met) + daysBetween(birth, met);
  const remaining = equalDayNumber - dayNumber(today);
  if (remaining > 0) return { state: 'before', days: remaining };
  if (remaining === 0) return { state: 'today', days: 0 };
  return { state: 'after', days: -remaining };
}

// Today's calendar day in the visitor's own time zone.
function localToday(now) {
  return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
}

// 4630 -> "4.630"
function formatNumber(n) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function pluralWord(n, one, other) {
  return n === 1 ? one : other;
}

// "12 anos, 8 meses e 5 dias"; units that are zero are left out.
function describeElapsed(parts) {
  const pieces = [];
  if (parts.years > 0) pieces.push(parts.years + ' ' + pluralWord(parts.years, 'ano', 'anos'));
  if (parts.months > 0) pieces.push(parts.months + ' ' + pluralWord(parts.months, 'mês', 'meses'));
  if (parts.days > 0 || pieces.length === 0) {
    pieces.push(parts.days + ' ' + pluralWord(parts.days, 'dia', 'dias'));
  }
  if (pieces.length === 1) return pieces[0];
  return pieces.slice(0, -1).join(', ') + ' e ' + pieces[pieces.length - 1];
}

// Picks the singular or plural wording of a message for the number n.
function pickMessage(n, message) {
  return n === 1 ? message.one : message.other;
}

// Everything the page shows, worked out for the given "today".
function buildCounters(site, today) {
  const { together, met, birth } = site.dates;
  const messages = site.messages;

  const daysTogether = daysBetween(together, today);
  const daysSinceMet = daysBetween(met, today);

  const anniversary = nextAnniversary(together, today);
  const daysToAnniversary = daysBetween(today, anniversary.date);
  const years = anniversary.number + ' ' + pluralWord(anniversary.number, 'ano', 'anos');
  const withYears = (text) => text.replace('{anos}', years);

  const half = halfOfLifeStatus(met, birth, today);

  return {
    hero: {
      number: formatNumber(daysTogether),
      label: pickMessage(daysTogether, messages.together),
      breakdown: describeElapsed(elapsedParts(together, today)),
    },
    met: {
      number: formatNumber(daysSinceMet),
      label: pickMessage(daysSinceMet, messages.met),
    },
    anniversary:
      daysToAnniversary === 0
        ? {
            number: messages.anniversaryToday.big,
            label: withYears(messages.anniversaryToday.label),
          }
        : {
            number: formatNumber(daysToAnniversary),
            label: withYears(pickMessage(daysToAnniversary, messages.anniversary)),
          },
    half:
      half.state === 'today'
        ? { number: messages.halfToday.big, label: messages.halfToday.label }
        : {
            number: formatNumber(half.days),
            label: pickMessage(
              half.days,
              half.state === 'before' ? messages.halfBefore : messages.halfAfter
            ),
          },
  };
}
