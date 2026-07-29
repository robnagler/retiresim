import { randomValue } from './RandomTable.js';

// Real S&P 500 nominal annual total returns (price + dividends
// reinvested), 1965-2025, sourced from published historical return
// tables. Committed here as a literal JavaScript constant, not
// cfg.json -- this is a fact about market history, not a per-user
// assumption, so every user of this project sees the same data (same
// spirit as Medicare.js's IRMAA_BRACKETS).
//
// Why a real historical year's full-calendar-year return instead of a
// hand-picked "crash magnitude": nobody actually liquidates a position at
// a crash's exact bottom -- money is invested continuously and spending
// only draws down what a given month needs, so a few bad months blend
// into the rest of the year's performance. 2020 is the clearest example:
// the COVID crash happened within it, but the full year still returned
// +18.40%. Using the actual annual figure captures that blending
// automatically; a synthetic "worst month annualized" figure would not.
const ANNUAL_RETURNS = [
    0.1245, -0.1006, 0.2398, 0.1106, -0.0850, 0.0401, 0.1431, 0.1898, -0.1466, -0.2647, // 1965-1974
    0.3720, 0.2384, -0.0718, 0.0656, 0.1844, 0.3242, -0.0491, 0.2155, 0.2256, 0.0627, // 1975-1984
    0.3173, 0.1867, 0.0525, 0.1661, 0.3169, -0.0310, 0.3047, 0.0762, 0.1008, 0.0132, // 1985-1994
    0.3758, 0.2296, 0.3336, 0.2858, 0.2104, -0.0910, -0.1189, -0.2210, 0.2868, 0.1088, // 1995-2004
    0.0491, 0.1579, 0.0549, -0.3700, 0.2646, 0.1506, 0.0211, 0.1600, 0.3239, 0.1369, // 2005-2014
    0.0138, 0.1196, 0.2183, -0.0438, 0.3149, 0.1840, 0.2871, -0.1811, 0.2629, 0.2502, // 2015-2024
    0.1788, // 2025
];

// Real US annual average CPI-U inflation rates, same 1965-2025 years, same
// index positions as ANNUAL_RETURNS above -- deliberately NOT an
// independent draw (see buildReturnSequence() below): inflation and market
// returns aren't actually independent in real history, and the worst
// combinations for a retiree are exactly when both went bad in the same
// year (1973-74's stagflation, 2022's inflation-driven bear market both
// pair a weak/negative market return with well-above-average inflation).
// Sampling them separately would understate that correlated risk --
// pairing each draw to one real historical year preserves it.
const ANNUAL_INFLATION = [
    0.016, 0.029, 0.031, 0.042, 0.055, 0.057, 0.044, 0.032, 0.062, 0.110, // 1965-1974
    0.091, 0.058, 0.065, 0.076, 0.113, 0.135, 0.103, 0.062, 0.032, 0.043, // 1975-1984
    0.036, 0.019, 0.036, 0.041, 0.048, 0.054, 0.042, 0.030, 0.030, 0.026, // 1985-1994
    0.028, 0.030, 0.023, 0.016, 0.022, 0.034, 0.028, 0.016, 0.023, 0.027, // 1995-2004
    0.034, 0.032, 0.028, 0.038, -0.004, 0.016, 0.032, 0.021, 0.015, 0.016, // 2005-2014
    0.001, 0.013, 0.021, 0.024, 0.018, 0.012, 0.047, 0.080, 0.041, 0.029, // 2015-2024
    0.026, // 2025
];

// Fisher-Yates shuffle of [0..length-1], driven by RandomTable draws --
// deterministic and reproducible for a given (trial, cycle) pair, like
// everything else derived from RandomTable. Each cycle's draws sweep the
// `year` argument forward by a full `length` (rather than reusing i from
// 0 each time), so cycle 1's draws read a completely different slice of
// RandomTable than cycle 0's for the same trial -- a real reshuffle, not
// an accidental repeat of the same permutation (unlike offsetting the
// trial/seed itself, which can collide modulo RandomTable's length).
function shuffledIndices(trial, cycle, length) {
    const indices = Array.from({ length }, (_, i) => i);
    for (let i = length - 1; i > 0; i--) {
        const j = Math.floor(randomValue(0, cycle * length + i, trial) * (i + 1));
        [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    return indices;
}

// Every trial walks a shuffled, non-repeating order of all 61 real
// historical years: once a year's been used, it isn't used again until
// every other year has also been used once -- a "shuffled bag," same idea
// as a card game reshuffling a fresh deck only once it runs out, rather
// than drawing with replacement from the full deck every time. If a
// simulation horizon is longer than 61 years, the pool reshuffles (a
// fresh permutation, not the same one repeated -- see shuffledIndices())
// once exhausted and continues; for this project's real horizons (well
// under 61 years), that reshuffle never triggers, so
// a trial simply never repeats a historical year at all. This is
// deliberately NOT a chronological replay of real history (the shuffle
// order is random and reproducible per trial, not fixed to real
// chronological order), and deliberately has no separate "does this year
// crash" gate or cooldown -- the real annual figures already include both
// ordinary and crash years in their true historical proportions, so a
// shuffled walk through all of them reproduces that same mix without a
// hand-tuned probability or magnitude list, while no longer letting a
// single lucky (or unlucky) year recur more than its real, one-time share.
//
// The full sequence is computed once, up front, for startYear..endYear,
// not re-rolled lazily year by year, so every account touching sp500Rate/
// inflationRate in a given trial sees identical draws -- same
// reproducibility guarantee RandomTable.js documents.
export function buildReturnSequence({ startYear, endYear, trial }) {
    const sequence = new Map();
    let cycle = 0;
    let shuffled = shuffledIndices(trial, cycle, ANNUAL_RETURNS.length);
    let position = 0;
    for (let year = startYear; year <= endYear; year++) {
        if (position >= shuffled.length) {
            cycle++;
            shuffled = shuffledIndices(trial, cycle, ANNUAL_RETURNS.length);
            position = 0;
        }
        const index = shuffled[position];
        position++;
        sequence.set(year, { sp500Rate: ANNUAL_RETURNS[index], inflationRate: ANNUAL_INFLATION[index] });
    }
    return sequence;
}
