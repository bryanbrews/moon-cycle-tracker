// ─── localStorage ────────────────────────────────────────────────────────────

const STORAGE_KEY = 'ovulate_data';

function saveData(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.error('Failed to save data:', e);
  }
}

function loadData() {
  try {
    const json = localStorage.getItem(STORAGE_KEY);
    return json ? JSON.parse(json) : null;
  } catch (e) {
    console.error('Failed to load data:', e);
    return null;
  }
}

// ─── Date utilities ───────────────────────────────────────────────────────────

function addDays(date, n) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + n);
  return d;
}

function daysBetween(a, b) {
  // Returns floor((b - a) / msPerDay) — can be negative
  return Math.floor((b - a) / 86400000);
}

function formatDate(date) {
  // Returns e.g. "June 14, 2026"
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

function parseLocalDate(str) {
  // Parses "YYYY-MM-DD" as UTC midnight to avoid timezone offset bugs
  const [y, m, d] = str.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

// ─── Moon phase engine ────────────────────────────────────────────────────────

const LUNAR_CYCLE = 29.530589;
const REF_NEW_MOON = new Date('2000-01-06T00:00:00Z'); // known new moon

function getMoonAge(date) {
  const elapsed = (date - REF_NEW_MOON) / 86400000;
  return ((elapsed % LUNAR_CYCLE) + LUNAR_CYCLE) % LUNAR_CYCLE;
}

function getMoonPhase(date) {
  const age = getMoonAge(date);
  let name, emoji;
  if (age < 1.85)       { name = 'New Moon';        emoji = '🌑'; }
  else if (age < 5.53)  { name = 'Waxing Crescent'; emoji = '🌒'; }
  else if (age < 9.22)  { name = 'First Quarter';   emoji = '🌓'; }
  else if (age < 12.91) { name = 'Waxing Gibbous';  emoji = '🌔'; }
  else if (age < 16.61) { name = 'Full Moon';       emoji = '🌕'; }
  else if (age < 20.30) { name = 'Waning Gibbous';  emoji = '🌖'; }
  else if (age < 23.99) { name = 'Last Quarter';    emoji = '🌗'; }
  else if (age < 27.68) { name = 'Waning Crescent'; emoji = '🌘'; }
  else                  { name = 'New Moon';        emoji = '🌑'; }
  return { name, emoji, age };
}

// ─── Cycle calculations ───────────────────────────────────────────────────────

function calcCycle(lmp, cycleLen, periodLen) {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const ovulationDay  = cycleLen - 14;                       // days from LMP
  const ovulationDate = addDays(lmp, ovulationDay);
  const fertileStart  = addDays(lmp, ovulationDay - 1);
  const fertileEnd    = addDays(lmp, ovulationDay + 1);      // inclusive — 3 days total
  const nextPeriod    = addDays(lmp, cycleLen);

  const todayCycleDay = daysBetween(lmp, today) + 1;         // day 1 = first day of period

  return { ovulationDate, fertileStart, fertileEnd, nextPeriod, todayCycleDay, periodLen };
}

// ─── Lunar fertility (natal lunar return) ─────────────────────────────────────

function getBirthMoonAngle(birthDate) {
  return getMoonAge(birthDate);
}

function getLunarReturnsInCycle(lmp, cycleLen, birthAngle) {
  // Collect every lunar return date that falls within [lmp, lmp + cycleLen)
  const cycleEnd = addDays(lmp, cycleLen);
  const returns = [];
  let from = new Date(lmp);
  for (let attempt = 0; attempt < 3; attempt++) {
    const ret = getNextLunarReturn(from, birthAngle);
    if (ret >= cycleEnd) break;
    returns.push(ret);
    from = addDays(ret, 1);
  }
  return returns;
}

function getNextLunarReturn(fromDate, birthMoonAngle) {
  // Scan forward day-by-day from fromDate (up to 30 days)
  // Find the day where getMoonAge is closest to birthMoonAngle
  // Handle wrap-around: distance = min(|age - angle|, LUNAR_CYCLE - |age - angle|)
  let bestDate = null;
  let bestDist = Infinity;
  for (let i = 0; i <= 30; i++) {
    const d = addDays(fromDate, i);
    const age = getMoonAge(d);
    const raw = Math.abs(age - birthMoonAngle);
    const dist = Math.min(raw, LUNAR_CYCLE - raw);
    if (dist < bestDist) {
      bestDist = dist;
      bestDate = d;
    }
  }
  return bestDate;
}

// ─── Due date + zodiac ────────────────────────────────────────────────────────

function calcDueDate(lmp) {
  return addDays(lmp, 280); // Naegele's rule
}

const ZODIAC = [
  { sign: 'Capricorn',   symbol: '♑', end: [1,  19] },
  { sign: 'Aquarius',    symbol: '♒', end: [2,  18] },
  { sign: 'Pisces',      symbol: '♓', end: [3,  20] },
  { sign: 'Aries',       symbol: '♈', end: [4,  19] },
  { sign: 'Taurus',      symbol: '♉', end: [5,  20] },
  { sign: 'Gemini',      symbol: '♊', end: [6,  20] },
  { sign: 'Cancer',      symbol: '♋', end: [7,  22] },
  { sign: 'Leo',         symbol: '♌', end: [8,  22] },
  { sign: 'Virgo',       symbol: '♍', end: [9,  22] },
  { sign: 'Libra',       symbol: '♎', end: [10, 22] },
  { sign: 'Scorpio',     symbol: '♏', end: [11, 21] },
  { sign: 'Sagittarius', symbol: '♐', end: [12, 21] },
  { sign: 'Capricorn',   symbol: '♑', end: [12, 31] }, // late Dec
];

function getZodiacSign(date) {
  const month = date.getUTCMonth() + 1;
  const day   = date.getUTCDate();
  for (const z of ZODIAC) {
    if (month < z.end[0] || (month === z.end[0] && day <= z.end[1])) {
      return z;
    }
  }
  return ZODIAC[0]; // Capricorn fallback
}

// ─── Zodiac SVG glyphs (traditional astrological symbols) ─────────────────────

const ZODIAC_GLYPHS = {
  Aries: `<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M50 70 L50 50"/>
    <path d="M50 50 C44 30 18 28 20 46 C22 56 36 52 50 50"/>
    <path d="M50 50 C56 30 82 28 80 46 C78 56 64 52 50 50"/>
  </svg>`,
  Taurus: `<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="4.5" stroke-linecap="round">
    <circle cx="50" cy="65" r="20"/>
    <path d="M30 60 C24 48 28 32 40 27 C50 23 60 27 60 27 C70 27 76 32 70 60"/>
  </svg>`,
  Gemini: `<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="4.5" stroke-linecap="round">
    <line x1="30" y1="22" x2="30" y2="78"/>
    <line x1="70" y1="22" x2="70" y2="78"/>
    <path d="M18 22 C36 14 64 14 82 22"/>
    <path d="M18 78 C36 86 64 86 82 78"/>
  </svg>`,
  Cancer: `<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="4.5" stroke-linecap="round">
    <path d="M25 38 C25 22 75 22 75 38 C75 55 25 55 25 38"/>
    <circle cx="80" cy="38" r="6"/>
    <path d="M75 62 C75 78 25 78 25 62 C25 45 75 45 75 62"/>
    <circle cx="20" cy="62" r="6"/>
  </svg>`,
  Leo: `<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="4.5" stroke-linecap="round">
    <circle cx="38" cy="55" r="17"/>
    <path d="M55 55 C62 55 72 48 76 38 C80 25 72 17 65 20 C58 23 58 35 65 42 C72 49 80 55 82 66 C84 76 78 82 72 80"/>
    <circle cx="72" cy="80" r="6"/>
  </svg>`,
  Virgo: `<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="4.5" stroke-linecap="round">
    <line x1="22" y1="22" x2="22" y2="78"/>
    <path d="M22 44 C22 28 40 18 52 28 C64 38 62 78 62 78"/>
    <path d="M62 44 C62 28 80 18 82 32 C84 46 74 54 68 62 C64 68 66 78 74 78"/>
  </svg>`,
  Libra: `<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="4.5" stroke-linecap="round">
    <line x1="15" y1="72" x2="85" y2="72"/>
    <line x1="15" y1="85" x2="85" y2="85"/>
    <path d="M32 72 C32 54 42 42 50 42 C58 42 68 54 68 72"/>
  </svg>`,
  Scorpio: `<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round">
    <line x1="15" y1="25" x2="15" y2="65"/>
    <path d="M15 44 C15 28 33 18 45 28 C57 38 55 65 55 65"/>
    <path d="M55 44 C55 28 72 18 80 30 C88 42 80 65 80 65"/>
    <path d="M80 65 L92 53"/>
    <path d="M92 53 L82 48 M92 53 L88 63"/>
  </svg>`,
  Sagittarius: `<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round">
    <line x1="18" y1="82" x2="82" y2="18"/>
    <path d="M82 18 L64 20 M82 18 L80 36"/>
    <line x1="22" y1="52" x2="68" y2="52"/>
  </svg>`,
  Capricorn: `<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="4.5" stroke-linecap="round">
    <path d="M20 22 L20 72 C20 80 30 85 38 80 C46 75 44 65 38 58 C32 51 22 50 22 50"/>
    <path d="M20 50 C34 40 55 36 68 44 C81 52 82 68 76 76 C70 84 58 84 52 78"/>
  </svg>`,
  Aquarius: `<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="4.5" stroke-linecap="round">
    <path d="M12 38 C24 28 32 48 44 38 C56 28 64 48 76 38 C82 32 88 34 88 38"/>
    <path d="M12 62 C24 52 32 72 44 62 C56 52 64 72 76 62 C82 56 88 58 88 62"/>
  </svg>`,
  Pisces: `<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="4.5" stroke-linecap="round">
    <path d="M50 18 C26 28 26 72 50 82"/>
    <path d="M50 18 C74 28 74 72 50 82"/>
    <line x1="20" y1="50" x2="80" y2="50"/>
  </svg>`,
};

// ─── Planetary events ─────────────────────────────────────────────────────────

// Small inline SVG icons (warm gold, distinct from the purple lunar markers).
const EVENT_ICONS = {
  solstice: `<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round">
    <circle cx="50" cy="50" r="15" fill="currentColor" stroke="none"/>
    <line x1="50" y1="6"  x2="50" y2="20"/>
    <line x1="50" y1="80" x2="50" y2="94"/>
    <line x1="6"  y1="50" x2="20" y2="50"/>
    <line x1="80" y1="50" x2="94" y2="50"/>
    <line x1="21" y1="21" x2="31" y2="31"/>
    <line x1="69" y1="69" x2="79" y2="79"/>
    <line x1="79" y1="21" x2="69" y2="31"/>
    <line x1="31" y1="69" x2="21" y2="79"/>
  </svg>`,
  equinox: `<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="50" cy="50" r="34"/>
    <path d="M50 16 A34 34 0 0 1 50 84 Z" fill="currentColor" stroke="none"/>
  </svg>`,
  // Solar eclipse — "ring of fire": a dark moon disc inside the Sun's corona ring.
  eclipseSolar: `<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round">
    <circle cx="50" cy="50" r="27"/>
    <circle cx="50" cy="50" r="14" fill="currentColor" stroke="none"/>
    <line x1="20" y1="20" x2="28" y2="28"/>
    <line x1="80" y1="20" x2="72" y2="28"/>
    <line x1="20" y1="80" x2="28" y2="72"/>
    <line x1="80" y1="80" x2="72" y2="72"/>
  </svg>`,
  // Lunar eclipse — the full Moon with Earth's round umbral shadow creeping across.
  eclipseLunar: `<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="50" cy="50" r="28"/>
    <path d="M50 22 A28 28 0 0 0 50 78 A22 22 0 0 1 50 22 Z" fill="currentColor" stroke="none"/>
  </svg>`,
  retrograde: `<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round" stroke-linejoin="round">
    <path d="M70 34 A28 28 0 1 0 76 60"/>
    <path d="M70 12 L70 36 L46 36"/>
  </svg>`,
};

// Computed annual events: solstices & equinoxes (approx fixed dates).
function getSeasonalEvents(year) {
  return [
    { kind: 'equinox',  name: 'Spring Equinox',  date: new Date(Date.UTC(year,  2, 20)) },
    { kind: 'solstice', name: 'Summer Solstice', date: new Date(Date.UTC(year,  5, 21)) },
    { kind: 'equinox',  name: 'Autumn Equinox',  date: new Date(Date.UTC(year,  8, 22)) },
    { kind: 'solstice', name: 'Winter Solstice', date: new Date(Date.UTC(year, 11, 21)) },
  ];
}

// Major annual meteor showers — each recurs on near-fixed dates every year, and
// is active over a range of nights (start…end) peaking on a single night (peak).
// Dates are [monthIndex, day]; active windows are drawn as a line, with the
// meteor icon marking the peak night. Ranges anchored to the peak's year handle
// showers that wrap the year boundary (e.g. the Quadrantids: Dec 28 → Jan 12).
const METEOR_SHOWERS = [
  { name: 'Quadrantids Meteor Shower',   start: [0,  1],  peak: [0,  3],  end: [0,  5]  },
  { name: 'Lyrids Meteor Shower',        start: [3, 19],  peak: [3, 22],  end: [3, 25]  },
  { name: 'Eta Aquariids Meteor Shower', start: [4,  3],  peak: [4,  6],  end: [4, 10]  },
  { name: 'Perseids Meteor Shower',      start: [7,  9],  peak: [7, 12],  end: [7, 14]  },
  { name: 'Orionids Meteor Shower',      start: [9, 19],  peak: [9, 21],  end: [9, 24]  },
  { name: 'Leonids Meteor Shower',       start: [10, 15], peak: [10, 17], end: [10, 19] },
  { name: 'Geminids Meteor Shower',      start: [11, 12], peak: [11, 14], end: [11, 16] },
];

// Builds concrete UTC start/peak/end dates for a shower whose peak falls in `peakYear`.
// The start may roll back into the prior year and the end may roll into the next.
function buildShowerRange(shower, peakYear) {
  const [sm, sd] = shower.start;
  const [pm, pd] = shower.peak;
  const [em, ed] = shower.end;
  const startYear = sm <= pm ? peakYear : peakYear - 1;
  const endYear   = em >= pm ? peakYear : peakYear + 1;
  return {
    name:  shower.name,
    start: new Date(Date.UTC(startYear, sm, sd)),
    peak:  new Date(Date.UTC(peakYear,  pm, pd)),
    end:   new Date(Date.UTC(endYear,   em, ed)),
  };
}

// Hardcoded eclipse table (eclipses can't be derived from the app's simple math).
const ECLIPSES = [
  { kind: 'eclipseSolar', name: 'Annular Solar Eclipse',  date: '2026-02-17' },
  { kind: 'eclipseLunar', name: 'Total Lunar Eclipse',    date: '2026-03-03' },
  { kind: 'eclipseSolar', name: 'Total Solar Eclipse',    date: '2026-08-12' },
  { kind: 'eclipseLunar', name: 'Partial Lunar Eclipse',  date: '2026-08-28' },
  { kind: 'eclipseSolar', name: 'Annular Solar Eclipse',  date: '2027-02-06' },
  { kind: 'eclipseLunar', name: 'Penumbral Lunar Eclipse', date: '2027-02-20' },
  { kind: 'eclipseLunar', name: 'Partial Lunar Eclipse',  date: '2027-07-18' },
  { kind: 'eclipseSolar', name: 'Total Solar Eclipse',    date: '2027-08-02' },
  { kind: 'eclipseLunar', name: 'Partial Lunar Eclipse',  date: '2027-08-17' },
  { kind: 'eclipseSolar', name: 'Annular Solar Eclipse',  date: '2028-01-26' },
  { kind: 'eclipseLunar', name: 'Partial Lunar Eclipse',  date: '2028-07-06' },
  { kind: 'eclipseSolar', name: 'Total Solar Eclipse',    date: '2028-07-22' },
  { kind: 'eclipseLunar', name: 'Total Lunar Eclipse',    date: '2028-12-31' },
];

// Hardcoded planetary retrograde spans — drawn as a lower-border highlight,
// color-coded per planet, with a ℞ icon on the day each one begins.
const RETROGRADES = [
  // Mercury (~3× per year)
  { kind: 'retrograde-mercury', name: 'Mercury Retrograde', start: '2026-02-26', end: '2026-03-20' },
  { kind: 'retrograde-mercury', name: 'Mercury Retrograde', start: '2026-06-29', end: '2026-07-23' },
  { kind: 'retrograde-mercury', name: 'Mercury Retrograde', start: '2026-10-24', end: '2026-11-13' },
  { kind: 'retrograde-mercury', name: 'Mercury Retrograde', start: '2027-02-09', end: '2027-03-03' },
  { kind: 'retrograde-mercury', name: 'Mercury Retrograde', start: '2027-06-10', end: '2027-07-04' },
  { kind: 'retrograde-mercury', name: 'Mercury Retrograde', start: '2027-10-07', end: '2027-10-28' },
  { kind: 'retrograde-mercury', name: 'Mercury Retrograde', start: '2028-01-24', end: '2028-02-14' },
  { kind: 'retrograde-mercury', name: 'Mercury Retrograde', start: '2028-05-21', end: '2028-06-14' },
  { kind: 'retrograde-mercury', name: 'Mercury Retrograde', start: '2028-09-19', end: '2028-10-11' },
  // Venus (~every 19 months, ~40 days)
  { kind: 'retrograde-venus', name: 'Venus Retrograde', start: '2026-10-03', end: '2026-11-13' },
  { kind: 'retrograde-venus', name: 'Venus Retrograde', start: '2028-05-10', end: '2028-06-22' },
  // Mars (~every 26 months, ~2–2.5 months)
  { kind: 'retrograde-mars', name: 'Mars Retrograde', start: '2027-01-10', end: '2027-04-01' },
];

// Returns span events (e.g. Mercury retrograde) that are active on `date`,
// flagging the first and last day so the bar can be capped with rounded ends.
function getActiveSpanEvents(date) {
  const spans = [];
  const t = date.getTime();
  for (const r of RETROGRADES) {
    const start = parseLocalDate(r.start).getTime();
    const end   = parseLocalDate(r.end).getTime();
    if (t >= start && t <= end) {
      spans.push({
        kind: r.kind,
        name: r.name,
        isStart: t === start,
        isEnd: t === end,
      });
    }
  }
  // Meteor showers: active over a range of nights, drawn as a line. Check the
  // surrounding peak years so year-wrapping showers (Quadrantids) resolve.
  const year = date.getUTCFullYear();
  for (const yr of [year - 1, year, year + 1]) {
    for (const sh of METEOR_SHOWERS) {
      const r = buildShowerRange(sh, yr);
      const start = r.start.getTime();
      const end   = r.end.getTime();
      if (t >= start && t <= end) {
        spans.push({
          kind: 'meteor',
          name: sh.name,
          isStart: t === start,
          isEnd: t === end,
        });
      }
    }
  }
  return spans;
}

// Returns any notable point-in-time events that fall exactly on `date` (UTC midnight).
function getPlanetaryEvents(date) {
  const events = [];
  const t = date.getTime();

  for (const ev of getSeasonalEvents(date.getUTCFullYear())) {
    if (ev.date.getTime() === t) events.push({ kind: ev.kind, name: ev.name });
  }
  for (const ec of ECLIPSES) {
    if (parseLocalDate(ec.date).getTime() === t) events.push({ kind: ec.kind, name: ec.name });
  }
  return events;
}

// Fills every [data-event-legend] container with the planetary-events key.
function populateEventLegends() {
  const items = [
    { kind: 'solstice',     label: 'Solstice' },
    { kind: 'equinox',      label: 'Equinox' },
    { kind: 'eclipseSolar', label: 'Solar Eclipse' },
    { kind: 'eclipseLunar', label: 'Lunar Eclipse' },
    { kind: 'meteor',       label: 'Meteor Shower', span: true },
    { kind: 'retrograde-mercury', label: 'Mercury Rx', span: true, icon: 'retrograde' },
    { kind: 'retrograde-venus',   label: 'Venus Rx',   span: true, icon: 'retrograde' },
    { kind: 'retrograde-mars',    label: 'Mars Rx',    span: true, icon: 'retrograde' },
  ];
  const html =
    `<span class="event-legend-title">Planetary Events</span>` +
    items.map(it => {
      const iconKey = it.icon || it.kind;
      const icon = EVENT_ICONS[iconKey] ? `<span class="event-legend-icon">${EVENT_ICONS[iconKey]}</span>` : '';
      const swatch = it.span ? `<span class="span-swatch span-${it.kind}"></span>` : '';
      return `<span class="legend-item">${icon}${swatch}${it.label}</span>`;
    }).join('') +
    `<span class="legend-note">Meteor showers — the line marks the active window of nights, brightest around the middle (the peak).</span>` +
    `<span class="legend-note">Rx (retrograde) — a stretch when a planet appears to move backward across the sky; in astrology, a time to slow down, reflect, and revisit.</span>`;
  document.querySelectorAll('[data-event-legend]').forEach(el => { el.innerHTML = html; });
}

// ─── Timeline rendering ───────────────────────────────────────────────────────

// Builds the per-day phase bar for one cycle into `container`.
// Shared by the current-cycle timeline and the 6-month outlook so they look identical.
function buildCycleDays(container, cycleStart, cycleLen, periodLen, lunarReturnDates = []) {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const ovulationDay  = cycleLen - 14;
  const ovulationDate = addDays(cycleStart, ovulationDay);
  const fertileStart  = addDays(cycleStart, ovulationDay - 1);
  const fertileEnd    = addDays(cycleStart, ovulationDay + 1);

  for (let i = 0; i < cycleLen; i++) {
    const dayDate = addDays(cycleStart, i);
    const div = document.createElement('div');
    div.className = 'timeline-day';

    // Phase classification
    if (i < periodLen) {
      div.classList.add('period');
    } else if (dayDate >= fertileStart && dayDate <= fertileEnd) {
      div.classList.add('fertile');
    } else if (dayDate > ovulationDate) {
      div.classList.add('luteal');
    } else {
      div.classList.add('follicular');
    }

    // Today marker
    if (daysBetween(dayDate, today) === 0) {
      div.classList.add('today');
      div.setAttribute('data-today', '');
    }

    // Moon phase marker — only on the FIRST day a notable phase begins
    const moon = getMoonPhase(dayDate);
    const notablePhases = ['New Moon', 'Full Moon', 'First Quarter', 'Last Quarter'];
    if (notablePhases.includes(moon.name)) {
      const prevMoon = getMoonPhase(addDays(dayDate, -1));
      if (prevMoon.name !== moon.name) {
        const marker = document.createElement('span');
        marker.className = 'moon-marker';
        marker.textContent = moon.emoji;
        div.appendChild(marker);
      }
    }

    // Lunar return marker
    const isLunarReturn = lunarReturnDates.some(d => d.getTime() === dayDate.getTime());
    if (isLunarReturn) {
      const lrMarker = document.createElement('span');
      lrMarker.className = 'lunar-return-marker';
      lrMarker.textContent = '☽';
      div.appendChild(lrMarker);
    }

    // Span events (e.g. Mercury retrograde) draw a continuous horizontal bar.
    // Adjacent in-span days overlap slightly so the bar reads as one strip.
    const spanEvents = getActiveSpanEvents(dayDate);
    for (const sp of spanEvents) {
      const spanBar = document.createElement('span');
      spanBar.className = 'span-bar span-' + sp.kind;
      if (sp.isStart) spanBar.classList.add('span-start');
      if (sp.isEnd) spanBar.classList.add('span-end');
      div.appendChild(spanBar);
    }

    // Point-in-time event marker (eclipse, solstice, equinox, meteor shower)
    const planetaryEvents = getPlanetaryEvents(dayDate);
    if (planetaryEvents.length) {
      const evMarker = document.createElement('span');
      evMarker.className = 'event-marker';
      evMarker.innerHTML = EVENT_ICONS[planetaryEvents[0].kind] || '';
      div.appendChild(evMarker);
    }

    const notes = [];
    if (isLunarReturn) notes.push('☽ Lunar Peak');
    for (const e of planetaryEvents) notes.push(e.name);
    for (const sp of spanEvents) {
      notes.push(sp.isStart ? sp.name + ' begins' : sp.name);
    }
    const eventNote = notes.length ? ' · ' + notes.join(' · ') : '';
    div.title = `Day ${i + 1} — ${formatDate(dayDate)} — ${moon.emoji} ${moon.name}${eventNote}`;
    container.appendChild(div);
  }
}

function renderTimeline(lmp, cycleLen, periodLen, lunarReturnDates = []) {
  const container = document.getElementById('timeline');
  container.innerHTML = '';

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  buildCycleDays(container, lmp, cycleLen, periodLen, lunarReturnDates);

  // ── Ruler: day numbers + month bands ────────────────────────────────────────
  buildCycleRuler(document.getElementById('timeline-ruler'), lmp, cycleLen);
}

// Builds the day-of-month numbers + month bands under a cycle bar.
// Shared by the current-cycle timeline and the 6-month outlook.
function buildCycleRuler(ruler, cycleStart, cycleLen) {
  ruler.innerHTML = '';

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  // Day numbers row
  const daysRow = document.createElement('div');
  daysRow.className = 'ruler-days';
  for (let i = 0; i < cycleLen; i++) {
    const d = addDays(cycleStart, i);
    const span = document.createElement('span');
    span.className = 'ruler-day';
    if (daysBetween(d, today) === 0) span.classList.add('ruler-today');
    span.textContent = d.getUTCDate();
    daysRow.appendChild(span);
  }
  ruler.appendChild(daysRow);

  // Group days by calendar month
  const monthGroups = [];
  for (let i = 0; i < cycleLen; i++) {
    const d = addDays(cycleStart, i);
    const key = d.getUTCFullYear() * 12 + d.getUTCMonth();
    if (!monthGroups.length || monthGroups[monthGroups.length - 1].key !== key) {
      monthGroups.push({
        key,
        name: d.toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' }),
        count: 0,
      });
    }
    monthGroups[monthGroups.length - 1].count++;
  }

  // Month bands row
  const monthsRow = document.createElement('div');
  monthsRow.className = 'ruler-months';
  monthGroups.forEach((m, idx) => {
    const div = document.createElement('div');
    div.className = 'ruler-month' + (idx % 2 === 1 ? ' ruler-month-alt' : '');
    div.style.flex = m.count;
    div.textContent = m.name;
    monthsRow.appendChild(div);
  });
  ruler.appendChild(monthsRow);
}

// ─── Summary panel rendering ──────────────────────────────────────────────────

function renderSummary(data) {
  const { lmp, cycleLen, periodLen, birthDate } = data;
  const cycle = calcCycle(lmp, cycleLen, periodLen);

  // Cycle summary (left column)
  document.getElementById('cycle-day').textContent =
    cycle.todayCycleDay >= 1 && cycle.todayCycleDay <= cycleLen
      ? `Day ${cycle.todayCycleDay} of ${cycleLen}`
      : 'Next cycle';

  document.getElementById('ovulation-date').textContent =
    formatDate(cycle.ovulationDate);

  document.getElementById('fertile-window').textContent =
    `${formatDate(cycle.fertileStart)} \u2013 ${formatDate(cycle.fertileEnd)}`;

  document.getElementById('next-period').textContent =
    formatDate(cycle.nextPeriod);

  // Lunar summary (right column) — only if birthDate provided
  const lunarSummary = document.getElementById('lunar-summary');

  if (birthDate) {
    const birthMoon  = getMoonPhase(birthDate);
    const birthAngle = getBirthMoonAngle(birthDate);
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const nextReturn = getNextLunarReturn(today, birthAngle);

    document.getElementById('birth-moon').textContent =
      `${birthMoon.emoji} ${birthMoon.name}`;

    document.getElementById('lunar-return').textContent =
      formatDate(nextReturn);

    lunarSummary.style.display = '';
  } else {
    lunarSummary.style.display = 'none';
  }
}

// ─── Holiday warning ──────────────────────────────────────────────────────────

function nthWeekday(year, month, weekday, n) {
  // month: 1-12, weekday: 0=Sun…6=Sat, n: 1-based occurrence
  const first = new Date(Date.UTC(year, month - 1, 1));
  let diff = weekday - first.getUTCDay();
  if (diff < 0) diff += 7;
  return new Date(Date.UTC(year, month - 1, 1 + diff + (n - 1) * 7));
}

function lastWeekday(year, month, weekday) {
  const last = new Date(Date.UTC(year, month, 0)); // last day of month
  let diff = last.getUTCDay() - weekday;
  if (diff < 0) diff += 7;
  return new Date(Date.UTC(year, month - 1, last.getUTCDate() - diff));
}

function getMajorHolidays(year) {
  return [
    { name: "New Year's Day",             date: new Date(Date.UTC(year,  0,  1)) },
    { name: 'Martin Luther King Jr. Day', date: nthWeekday(year,  1, 1, 3) }, // 3rd Mon Jan
    { name: "Presidents' Day",            date: nthWeekday(year,  2, 1, 3) }, // 3rd Mon Feb
    { name: 'Memorial Day',               date: lastWeekday(year, 5, 1)    }, // last Mon May
    { name: 'Independence Day',           date: new Date(Date.UTC(year,  6,  4)) },
    { name: 'Labor Day',                  date: nthWeekday(year,  9, 1, 1) }, // 1st Mon Sep
    { name: 'Thanksgiving',               date: nthWeekday(year, 11, 4, 4) }, // 4th Thu Nov
    { name: 'Christmas',                  date: new Date(Date.UTC(year, 11, 25)) },
  ];
}

function getHolidayWarning(dueDate) {
  const year = dueDate.getUTCFullYear();
  const holidays = [
    ...getMajorHolidays(year - 1),
    ...getMajorHolidays(year),
    ...getMajorHolidays(year + 1),
  ];
  for (const h of holidays) {
    const diff = Math.abs(daysBetween(dueDate, h.date));
    if (diff <= 7) {
      const proximity = diff === 0
        ? `on ${h.name}`
        : `within ${diff} day${diff === 1 ? '' : 's'} of ${h.name}`;
      return `Your estimated due date falls ${proximity} (${formatDate(h.date)}). Hospitals may have adjusted staffing around this time.`;
    }
  }
  return null;
}

// ─── Due date rendering ───────────────────────────────────────────────────────

function renderDueDate(lmp) {
  const dueDate = calcDueDate(lmp);
  const zodiac  = getZodiacSign(dueDate);

  document.getElementById('due-date').textContent = formatDate(dueDate);
  const glyph = ZODIAC_GLYPHS[zodiac.sign] || '';
  document.getElementById('zodiac-sign').innerHTML =
    `<div class="zodiac-glyph">${glyph}<span class="sign-name">${zodiac.sign}</span></div>`;

  const warning = getHolidayWarning(dueDate);
  const el = document.getElementById('holiday-warning');
  if (warning) {
    el.textContent = warning;
    el.removeAttribute('hidden');
  } else {
    el.setAttribute('hidden', '');
  }
}

// ─── 6-month cycle outlook ────────────────────────────────────────────────────

function renderCycles(lmp, cycleLen, periodLen, birthDate) {
  const container = document.getElementById('cycles-table');
  container.innerHTML = '';

  const end = new Date(lmp);
  end.setUTCMonth(end.getUTCMonth() + 6);

  const birthAngle = birthDate ? getBirthMoonAngle(birthDate) : null;

  for (let n = 0; ; n++) {
    const cycleStart = addDays(lmp, n * cycleLen);
    if (cycleStart > end) break;

    const cycleEnd = addDays(cycleStart, cycleLen - 1);
    const dueDate  = calcDueDate(cycleStart);
    const zodiac   = getZodiacSign(dueDate);
    const lunarReturns = birthAngle != null
      ? getLunarReturnsInCycle(cycleStart, cycleLen, birthAngle)
      : [];

    const ovulationDay = cycleLen - 14;
    const fertileStart = addDays(cycleStart, ovulationDay - 1);
    const fertileEnd   = addDays(cycleStart, ovulationDay + 1);

    const row = document.createElement('div');
    row.className = 'cycle-row';

    // Header: cycle number + date span
    const head = document.createElement('div');
    head.className = 'cycle-row-head';
    head.innerHTML =
      `<span class="cycle-label">Cycle ${n + 1}</span>` +
      `<span class="cycle-dates">${formatDate(cycleStart)} \u2013 ${formatDate(cycleEnd)}</span>`;
    row.appendChild(head);

    // Bar + ruler share a track so they scroll together on narrow screens
    const track = document.createElement('div');
    track.className = 'cycle-track';

    // Phase bar — identical rendering to the current cycle
    const bar = document.createElement('div');
    bar.className = 'cycle-bar';
    buildCycleDays(bar, cycleStart, cycleLen, periodLen, lunarReturns);
    track.appendChild(bar);

    // Ruler: day-of-month numbers + month bands
    const ruler = document.createElement('div');
    ruler.className = 'cycle-ruler';
    buildCycleRuler(ruler, cycleStart, cycleLen);
    track.appendChild(ruler);

    row.appendChild(track);

    // Footer: fertile window (middle) + due date & zodiac icon (right)
    const foot = document.createElement('div');
    foot.className = 'cycle-row-foot';
    const glyph = ZODIAC_GLYPHS[zodiac.sign] || '';
    foot.innerHTML =
      `<div class="cycle-fertile">` +
        `<span class="cycle-foot-label">Fertile Window</span>` +
        `<span class="cycle-fertile-dates">${formatDate(fertileStart)} \u2013 ${formatDate(fertileEnd)}</span>` +
      `</div>` +
      `<div class="cycle-result">` +
        `<div class="cycle-due">` +
          `<span class="cycle-foot-label">Potential Due Date</span>` +
          `<span class="cycle-due-date">${formatDate(dueDate)}</span>` +
        `</div>` +
        `<div class="cycle-sign">` +
          `<span class="cycle-sign-icon">${glyph}</span>` +
          `<span class="cycle-sign-name">${zodiac.sign}</span>` +
        `</div>` +
      `</div>`;
    row.appendChild(foot);

    container.appendChild(row);
  }
}

// ─── Main render function ─────────────────────────────────────────────────────

function render(data) {
  const lmp       = parseLocalDate(data.lmp);
  const birthDate = data.birthDate ? parseLocalDate(data.birthDate) : null;

  const lunarReturnDates = birthDate
    ? getLunarReturnsInCycle(lmp, data.cycleLen, getBirthMoonAngle(birthDate))
    : [];

  renderTimeline(lmp, data.cycleLen, data.periodLen, lunarReturnDates);
  renderSummary({ lmp, cycleLen: data.cycleLen, periodLen: data.periodLen, birthDate });
  renderDueDate(lmp);
  renderCycles(lmp, data.cycleLen, data.periodLen, birthDate);

  // Show all sections
  document.getElementById('timeline-section')?.removeAttribute('hidden');
  document.getElementById('summary-section')?.removeAttribute('hidden');
  document.getElementById('due-date-section')?.removeAttribute('hidden');
  document.getElementById('cycles-section')?.removeAttribute('hidden');
}

// ─── Form logic ───────────────────────────────────────────────────────────────

// On page load
populateEventLegends();

const savedData = loadData();
if (savedData) {
  // Populate form fields
  document.getElementById('lmp').value        = savedData.lmp;
  document.getElementById('cycle-len').value  = savedData.cycleLen;
  document.getElementById('period-len').value = savedData.periodLen;
  if (savedData.birthDate) document.getElementById('birth-date').value = savedData.birthDate;

  // Collapse settings, show edit button
  document.getElementById('settings').classList.add('settings-saved');
  document.getElementById('settings-form').hidden = true;
  document.getElementById('edit-btn').hidden = false;

  render(savedData);
}

// Form submit
document.getElementById('settings-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const data = {
    lmp:       document.getElementById('lmp').value,
    cycleLen:  parseInt(document.getElementById('cycle-len').value, 10),
    periodLen: parseInt(document.getElementById('period-len').value, 10),
    birthDate: document.getElementById('birth-date').value || null,
  };

  if (!data.lmp || isNaN(data.cycleLen) || isNaN(data.periodLen) || data.periodLen >= data.cycleLen) {
    alert('Please check your inputs. Period length must be less than cycle length.');
    return;
  }

  saveData(data);

  // Collapse settings
  document.getElementById('settings').classList.add('settings-saved');
  document.getElementById('settings-form').hidden = true;
  document.getElementById('edit-btn').hidden = false;

  render(data);
});

// Edit button
document.getElementById('edit-btn').addEventListener('click', () => {
  document.getElementById('settings').classList.remove('settings-saved');
  document.getElementById('settings-form').hidden = false;
  document.getElementById('edit-btn').hidden = true;
});

// ─── YouTube music player ─────────────────────────────────────────────────────

let ytPlayer = null;

// Define callback BEFORE injecting the API script — no race condition.
window.onYouTubeIframeAPIReady = function () {
  ytPlayer = new YT.Player('yt-player', {
    videoId: 'rLhrfCZROlQ',
    playerVars: {
      autoplay:       1,
      controls:       0,
      disablekb:      1,
      fs:             0,
      iv_load_policy: 3,
      // No loop/playlist — YouTube's own autoplay handles the next video
    },
    events: {
      onReady:       function (e) { e.target.setVolume(40); updateMusicBtn(); },
      onStateChange: updateMusicBtn,
    },
  });
};

(function () {
  const tag = document.createElement('script');
  tag.src = 'https://www.youtube.com/iframe_api';
  document.head.appendChild(tag);
}());

function updateMusicBtn() {
  const btn = document.getElementById('music-play');
  if (!btn || !ytPlayer) return;
  const playing = ytPlayer.getPlayerState() === 1;
  btn.textContent = playing ? '⏸' : '▶';
  btn.setAttribute('aria-label', playing ? 'Pause music' : 'Play music');
}

document.getElementById('music-play').addEventListener('click', function () {
  if (!ytPlayer) return;
  if (ytPlayer.getPlayerState() === 1) {
    ytPlayer.pauseVideo();
  } else {
    ytPlayer.playVideo();
  }
});

document.getElementById('music-skip').addEventListener('click', function () {
  if (!ytPlayer) return;
  // Seeking to the end triggers YouTube's end-of-video → autoplay next video
  ytPlayer.seekTo(ytPlayer.getDuration(), true);
});
