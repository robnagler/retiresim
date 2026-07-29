import { randomValue } from './RandomTable.js';

// Given a year and this year's random draw, decide whether a crash
// happens, applying "non-recurring" as a one-year cooldown: the year
// immediately after a crash always has zero crash probability, then
// normal odds resume. cfg.crashes is applied in the ORDER given, cycling
// -- not drawn randomly among them -- so a stress run is traceable to a
// specific real historical sequence and reproducible from cfg.json alone.
// The full sequence is computed once, up front, for startYear..endYear,
// not re-rolled lazily year by year, so every account touching sp500Rate
// in a given trial sees the identical crash years.
export function buildCrashSequence({ startYear, endYear, annualProbability, crashes, trial }) {
    const sequence = new Map();
    let cooldown = false;
    let nextCrashIndex = 0;
    for (let year = startYear; year <= endYear; year++) {
        if (cooldown) {
            cooldown = false;
            continue;
        }
        if (randomValue(startYear, year, trial) < annualProbability) {
            sequence.set(year, crashes[nextCrashIndex % crashes.length].rate);
            nextCrashIndex++;
            cooldown = true;
        }
    }
    return sequence;
}
