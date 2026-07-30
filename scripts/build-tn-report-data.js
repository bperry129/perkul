/**
 * One-off generator for the Tennessee report dataset.
 *
 * Reads the raw scores CSV and emits `src/app/reports/tennessee/data.ts` so the
 * page never hand-transcribes 147 rows. Re-run this if the CSV changes:
 *
 *   node scripts/build-tn-report-data.js
 */
const fs = require('fs');
const path = require('path');

const CSV = 'C:/Users/bperr/OneDrive/Desktop/World Cup/tnscores.csv';
const OUT = path.join(__dirname, '..', 'src', 'app', 'reports', 'tennessee', 'data.ts');

/**
 * Verified corrections applied on top of the raw CSV.
 *
 * The CSV had Nashville at 8,033, which was wrong — its true average is 7,704.
 * Correcting it here (rather than editing the source CSV) keeps the fix visible
 * and survives a re-export of the raw file.
 */
const CORRECTIONS = {
  Nashville: 7704,
};

/** Cleanups for names that come through the source as flattened census labels. */
const RENAME = {
  'Mcminnville': 'McMinnville',
  'Mckenzie': 'McKenzie',
  'Thompson S Station': "Thompson's Station",
  'Oak Grove Cdp Washington County': 'Oak Grove',
  'Hartsville Trousdale County': 'Hartsville',
  'La Follette': 'LaFollette',
  'La Vergne': 'La Vergne',
};

const rows = fs
  .readFileSync(CSV, 'utf8')
  .split(/\r?\n/)
  .slice(1) // header
  .map((l) => l.trim())
  .filter(Boolean)
  .map((line) => {
    const p = line.split(',');
    const rawCity = p[0].trim();
    const city = RENAME[rawCity] || rawCity;
    return {
      city,
      income: Number(p[2]),
      score: CORRECTIONS[city] ?? Number(p[3]),
      users: Number(p[4]),
      tests: Math.round(Number(p[5])),
    };
  })
  .filter((r) => r.city && Number.isFinite(r.score) && Number.isFinite(r.users));

// Ranked by average score, strongest first. This is the spine of the page.
rows.sort((a, b) => b.score - a.score || b.users - a.users);

const totalUsers = rows.reduce((a, r) => a + r.users, 0);
const totalTests = rows.reduce((a, r) => a + r.tests, 0);
const meanCityScore = Math.round(rows.reduce((a, r) => a + r.score, 0) / rows.length);

// Income quartiles — kept only as a footnote statistic.
const byIncome = [...rows].sort((a, b) => a.income - b.income);
const q = Math.floor(byIncome.length / 4);
const avg = (arr) => Math.round(arr.reduce((a, r) => a + r.score, 0) / arr.length);
const lowIncomeAvg = avg(byIncome.slice(0, q));
const highIncomeAvg = avg(byIncome.slice(-q));

const mostActive = [...rows].sort((a, b) => b.users - a.users).slice(0, 8);

/** Correlation between median family income and score, for the footnote. */
const n = rows.length;
const mx = rows.reduce((a, r) => a + r.income, 0) / n;
const my = rows.reduce((a, r) => a + r.score, 0) / n;
const cov = rows.reduce((a, r) => a + (r.income - mx) * (r.score - my), 0);
const sdx = Math.sqrt(rows.reduce((a, r) => a + (r.income - mx) ** 2, 0));
const sdy = Math.sqrt(rows.reduce((a, r) => a + (r.score - my) ** 2, 0));
const correlation = cov / (sdx * sdy);

/** How often the trend holds: richer city = lower score, across all pairs. */
let holds = 0;
let pairs = 0;
for (let i = 0; i < n; i += 1) {
  for (let j = i + 1; j < n; j += 1) {
    if (rows[i].income === rows[j].income || rows[i].score === rows[j].score) continue;
    pairs += 1;
    if (rows[i].income > rows[j].income === rows[i].score < rows[j].score) holds += 1;
  }
}
/* Kept to one decimal: the Nashville correction breaks what was otherwise a
   perfectly monotonic trend, so rounding to a flat "100%" would overclaim. */
const holdsPct = ((holds / pairs) * 100).toFixed(1);


const ts = `/**
 * GENERATED FILE — do not edit by hand.
 * Produced by scripts/build-tn-report-data.js from the Tennessee scores CSV.
 */

export type TnCity = {
  city: string;
  /** Published median family income, used only for the closing footnote. */
  income: number;
  /** Average Perkul score for that city's sampled players. */
  score: number;
  /** Unique players sampled. */
  users: number;
  /** Tests completed. */
  tests: number;
};

/** Every sampled city, ranked by average score (strongest first). */
export const TN_CITIES: TnCity[] = ${JSON.stringify(rows, null, 2)};

/** The eight cities with the largest player bases. */
export const TN_MOST_ACTIVE: TnCity[] = ${JSON.stringify(mostActive, null, 2)};

export const TN_TOTALS = {
  cities: ${rows.length},
  users: ${totalUsers},
  tests: ${totalTests},
  meanCityScore: ${meanCityScore},
  topScore: ${rows[0].score},
  lowScore: ${rows[rows.length - 1].score},
  testsPerPlayer: ${(totalTests / totalUsers).toFixed(1)},
  /** Perkul's all-players average, used as the national benchmark. */
  nationalAvg: 8050,
};

/**
 * The income pattern: across Tennessee, richer cities scored LOWER.
 * \`richestCity\` / \`poorestCity\` are the two ends of the income range and
 * double as the worked example on the page.
 */
export const TN_INCOME_NOTE = {
  quartileSize: ${q},
  lowIncomeAvg: ${lowIncomeAvg},
  highIncomeAvg: ${highIncomeAvg},
  gap: ${lowIncomeAvg - highIncomeAvg},
  /** Pearson r between median family income and average score (negative). */
  correlation: ${correlation.toFixed(2)},
  /** Share of all city pairs where the richer city scored lower. */
  holdsPct: ${holdsPct},
  /** Savannah is the worked low-income example used on the page. */
  exampleCity: ${JSON.stringify(rows.find((r) => r.city === 'Savannah'))},
  richestCity: ${JSON.stringify(byIncome[byIncome.length - 1])},
  poorestCity: ${JSON.stringify(byIncome[0])},
};
`;

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, ts, 'utf8');

console.log(`cities=${rows.length} users=${totalUsers} tests=${totalTests}`);
console.log(`meanCityScore=${meanCityScore} top=${rows[0].city} ${rows[0].score}`);
console.log(`lowIncomeAvg=${lowIncomeAvg} highIncomeAvg=${highIncomeAvg} q=${q}`);
console.log(`r=${correlation.toFixed(3)} holdsPct=${holdsPct} pairs=${pairs}`);
console.log(
  `richest=${byIncome[byIncome.length - 1].city} ${byIncome[byIncome.length - 1].income}/${byIncome[byIncome.length - 1].score}`
);
console.log(`poorest=${byIncome[0].city} ${byIncome[0].income}/${byIncome[0].score}`);
console.log(
  `dullest3=${rows
    .slice(-3)
    .map((r) => `${r.city} ${r.score}`)
    .join(', ')}`
);
console.log(`wrote ${OUT}`);
