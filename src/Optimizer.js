import { Base } from './Base.js';
import { Config } from './Config.js';
import { Bookkeeper } from './Bookkeeper.js';
import { Simulator } from './Simulator.js';
import { claimAgeCandidates } from './SocialSecurity.js';
import { InsufficientFundsError } from './InsufficientFundsError.js';

// All 6 orderings of the 3 withdrawal tax categories (see Cash.js's
// categoryOf()) -- written out literally rather than computed, since the
// set is fixed and tiny.
const CATEGORY_ORDERS = [
    ['ltcg', 'income', 'taxFree'],
    ['ltcg', 'taxFree', 'income'],
    ['income', 'ltcg', 'taxFree'],
    ['income', 'taxFree', 'ltcg'],
    ['taxFree', 'ltcg', 'income'],
    ['taxFree', 'income', 'ltcg'],
];

// candidate is a plain object (categoryOrder/ltcgCeiling/incomeCeiling),
// not a primitive -- toString() gives printNetWorthTable's String(candidate)
// a readable label instead of "[object Object]".
function categoryOrderCandidate(categoryOrder, ltcgCeiling, incomeCeiling) {
    return {
        categoryOrder,
        ltcgCeiling,
        incomeCeiling,
        toString() {
            const fmt = (v) => (v === Infinity ? 'inf' : v);
            return `${categoryOrder.join('>')} ltcg<=${fmt(ltcgCeiling)} income<=${fmt(incomeCeiling)}`;
        },
    };
}

// CLAUDE.md's "Optimize Variables": one entry per implemented variable.
// candidates() lists the values to try; apply() overrides a cloned
// config's field for one candidate.
export const OPTIMIZE_VARIABLES = [
    {
        label: 'SS claim age',
        // Excludes claim ages already passed as of Simulator.startYear --
        // not real, actionable choices for someone already older than them.
        candidates: (configData) => {
            const { birthYear } = configData.Cash.incomeOrder.find((e) => e.name === 'SocialSecurity');
            return claimAgeCandidates({ birthYear, asOfYear: configData.Simulator.startYear });
        },
        apply: (data, candidate) => {
            data.Cash.incomeOrder.find((e) => e.name === 'SocialSecurity').claimAge = candidate;
        },
    },
    {
        label: 'Withdrawal category order + ceilings',
        // Searches which tax category (realized gains / ordinary income /
        // tax-free) gets drawn down first, second, third, crossed with
        // each of the two capped categories' bracket-boundary ceilings
        // (plus "no cap") -- the interesting choices are "fill up to the
        // top of this bracket," not arbitrary dollar amounts in between.
        // taxFree is never a ceiling candidate axis -- it's never capped
        // (see Cash.categoryRoom()).
        candidates: (configData) => {
            const tax = configData.Cash.spendingOrder.find((e) => e.class === 'TaxCalculator');
            const ltcgCeilings = [...tax.ltcgBrackets.map((b) => b.upTo).filter((upTo) => upTo !== null), Infinity];
            const incomeCeilings = [...tax.federalBrackets.map((b) => b.upTo).filter((upTo) => upTo !== null), Infinity];
            const rv = [];
            for (const categoryOrder of CATEGORY_ORDERS) {
                for (const ltcgCeiling of ltcgCeilings) {
                    for (const incomeCeiling of incomeCeilings) {
                        rv.push(categoryOrderCandidate(categoryOrder, ltcgCeiling, incomeCeiling));
                    }
                }
            }
            return rv;
        },
        apply: (data, candidate) => {
            data.Cash.categoryOrder = candidate.categoryOrder;
            data.Cash.ltcgCeiling = candidate.ltcgCeiling;
            data.Cash.incomeCeiling = candidate.incomeCeiling;
        },
    },
];

// Owns the full candidate-evaluation pipeline (Config -> Bookkeeper ->
// Simulator -> netWorth()) and the console reporting on top of it, per
// CLAUDE.md's TODO: "optimizer should contain all the optimization stuff
// including running the simulator." main.js only builds classes/configData
// and decides whether to call runAll() or (in --debug) skip the optimizer
// entirely for a single raw run.
export class Optimizer extends Base {
    // candidates: any non-empty array. evaluate(candidate) -> number,
    // higher is better.
    run(candidates, evaluate) {
        const all = candidates.map((candidate) => ({ candidate, score: evaluate(candidate) }));
        const best = all.reduce((a, b) => (b.score > a.score ? b : a));
        return { best: best.candidate, score: best.score, all };
    }

    // Builds one candidate's Config/Bookkeeper without running the
    // Simulator, so callers can choose whether to run it silently (for
    // scoring) or with a per-year report callback.
    buildPipeline(configData, classes, variable, candidate) {
        const data = structuredClone(configData);
        variable.apply(data, candidate);
        const config = new Config(data);
        const bookkeeper = new Bookkeeper({ config, classes });
        return { config, bookkeeper };
    }

    // A candidate that hit InsufficientFundsError is scored 0 for sorting
    // purposes, but displayed as "0 (YYYY)" -- YYYY being the year it ran
    // out -- so it reads as a failure, not a real zero-net-worth result.
    formatScore(candidate, score, failedYears) {
        const year = failedYears.get(candidate);
        return year !== undefined ? `0 (${year})` : score.toFixed(0);
    }

    // A full candidate/net-worth table implies a real tradeoff was
    // searched. Cases where that's misleading: only one legal candidate
    // existed (e.g. SS claim age when already past 70, see
    // claimAgeCandidates()), every candidate scored the same, or every
    // candidate ran out of money (a tie at 0 for a different reason than
    // "this variable doesn't matter"). All are collapsed to one flagged
    // line instead of a table that looks informative but isn't.
    printNetWorthTable(label, netWorth, failedYears) {
        if (failedYears.size === netWorth.all.length) {
            console.log(`\n${label} -- every candidate ran out of money:`);
            for (const { candidate } of netWorth.all) {
                console.log(`  ${String(candidate).padStart(9)}   ${this.formatScore(candidate, 0, failedYears).padStart(12)}`);
            }
            return;
        }
        if (netWorth.all.length === 1) {
            console.log(`\n${label} -- only one legal candidate (${netWorth.best}), net worth ${this.formatScore(netWorth.best, netWorth.score, failedYears)}`);
            return;
        }
        const scores = netWorth.all.map((r) => r.score);
        if (Math.max(...scores) - Math.min(...scores) < 0.01) {
            console.log(`\n${label} -- no effect on net worth (all ${netWorth.all.length} candidates tie at ${netWorth.score.toFixed(0)})`);
            return;
        }
        console.log(`\n${label}`);
        console.log(`  ${'Candidate'.padStart(9)}   ${'Net Worth'.padStart(12)}`);
        for (const { candidate, score } of netWorth.all) {
            const marker = candidate === netWorth.best ? '  <- best' : '';
            console.log(`  ${String(candidate).padStart(9)}   ${this.formatScore(candidate, score, failedYears).padStart(12)}${marker}`);
        }
    }

    // Runs every variables entry against configData, printing a
    // candidate/net-worth table for each.
    runAll(configData, classes, variables = OPTIMIZE_VARIABLES) {
        for (const variable of variables) {
            const candidates = variable.candidates(configData);
            // Keyed by candidate: which ones hit InsufficientFundsError and
            // in what year, so the rest of the grid keeps running instead
            // of the whole process aborting on the first candidate that
            // runs out of money.
            const failedYears = new Map();
            const evaluate = (candidate) => {
                const { config, bookkeeper } = this.buildPipeline(configData, classes, variable, candidate);
                try {
                    new Simulator({ bookkeeper, config }).run();
                    return bookkeeper.netWorth();
                } catch (err) {
                    if (!(err instanceof InsufficientFundsError)) {
                        throw err;
                    }
                    failedYears.set(candidate, err.year);
                    return 0;
                }
            };
            const rv = this.run(candidates, evaluate);
            this.printNetWorthTable(variable.label, rv, failedYears);
        }
    }
}
