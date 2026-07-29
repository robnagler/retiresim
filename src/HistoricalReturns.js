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

// Every simulated year, for every trial, independently picks one of the
// 61 real historical years' returns uniformly at random (with
// replacement -- picking the same historical year twice, even in
// consecutive simulated years, is a real possible outcome, not
// prevented). This is deliberately NOT a chronological replay of real
// history (there's no reason simulated year 2026 should behave like real
// 1965 just because they're both "first"), and deliberately has no
// separate "does this year crash" gate or cooldown -- the real annual
// figures already include both ordinary and crash years in their true
// historical proportions, so sampling uniformly from them reproduces that
// same mix without needing a hand-tuned probability or magnitude list.
// Back-to-back bad years (e.g. 1973 then 1974) can and do get drawn
// together sometimes, same as real history; running many trials is what
// surfaces how often that particular bad luck actually matters.
//
// The full sequence is computed once, up front, for startYear..endYear,
// not re-rolled lazily year by year, so every account touching sp500Rate
// in a given trial sees identical draws -- same reproducibility
// guarantee RandomTable.js documents.
export function buildReturnSequence({ startYear, endYear, trial }) {
    const sequence = new Map();
    for (let year = startYear; year <= endYear; year++) {
        const index = Math.floor(randomValue(startYear, year, trial) * ANNUAL_RETURNS.length);
        sequence.set(year, ANNUAL_RETURNS[index]);
    }
    return sequence;
}
