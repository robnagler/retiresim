import { Base } from './Base.js';
import { Config } from './Config.js';
import { Bookkeeper } from './Bookkeeper.js';
import { Simulator } from './Simulator.js';
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

// Both the Order column and the cap columns use Cash.js's real
// categoryOf() identifiers ('ltcg'/'income'/'taxFree') directly, not a
// friendlier alias -- an earlier alias scheme ("Trad cap" meaning
// "income") cost the user a real double-take once already. Cap columns
// show the bracket index alongside its resolved dollar amount (e.g.
// "197,300[3]") so the candidate in cfg.json's ltcgCeilingBracket/
// incomeCeilingBracket fields (indices, not dollar amounts -- see
// Cash.categoryRoom()) can be read directly off the table.
const fmtCeiling = (v, bracket) => (v === Infinity ? 'none' : `${v.toLocaleString()}[${bracket}]`);

// candidate is a plain object (categoryOrder/ltcgCeilingBracket/
// incomeCeilingBracket), not a primitive. `columns` gives
// printNetWorthTable() a real multi-column table instead of cramming
// everything into one long "Candidate" string -- a candidate this shaped
// (126 of them, once per category-order/ceiling-bracket combination) is
// unreadable as a single column. `toString()` is still needed as a
// fallback for the "every candidate ran out of money" list, which doesn't
// build a columnar table. ltcgBrackets/federalBrackets are the *current*
// (Simulator.startYear) bracket tables, passed in only for display --
// the ceiling actually applied at simulation time is resolved fresh each
// year against the live, already-grown tables (see Cash.categoryRoom()),
// so the real dollar amount enforced later in the simulation will be
// higher than what's shown here.
function categoryOrderCandidate(categoryOrder, ltcgCeilingBracket, incomeCeilingBracket, ltcgBrackets, federalBrackets) {
    const ltcgDisplay = ltcgCeilingBracket == null ? Infinity : ltcgBrackets[ltcgCeilingBracket].upTo;
    const incomeDisplay = incomeCeilingBracket == null ? Infinity : federalBrackets[incomeCeilingBracket].upTo;
    return {
        categoryOrder,
        ltcgCeilingBracket,
        incomeCeilingBracket,
        columns: {
            Order: categoryOrder.join(' > '),
            'ltcg cap': fmtCeiling(ltcgDisplay, ltcgCeilingBracket),
            'income cap': fmtCeiling(incomeDisplay, incomeCeilingBracket),
        },
        toString() {
            return `${categoryOrder.join('>')} ltcg<=${fmtCeiling(ltcgDisplay, ltcgCeilingBracket)} income<=${fmtCeiling(incomeDisplay, incomeCeilingBracket)}`;
        },
    };
}

// CLAUDE.md's "Optimize Variables": one entry per implemented variable.
// candidates() lists the values to try; apply() overrides a cloned
// config's field for one candidate.
export const OPTIMIZE_VARIABLES = [
    {
        label: 'Withdrawal category order + ceilings',
        // Searches which tax category (realized gains / ordinary income /
        // tax-free) gets drawn down first, second, third, crossed with
        // each of the two capped categories' bracket-index ceilings (plus
        // "no cap") -- the interesting choices are "fill up to the top of
        // this bracket," not arbitrary dollar amounts in between. Indices,
        // not dollar amounts -- Cash.categoryRoom() resolves the index
        // against that year's live bracket table, so the applied ceiling
        // grows every year along with the real brackets (see Cash.js).
        // taxFree is never a ceiling candidate axis -- it's never capped
        // (see Cash.categoryRoom()).
        candidates: (configData) => {
            const tax = configData.Cash.spendingOrder.find((e) => e.class === 'TaxCalculator');
            const finiteIndices = (brackets) => [...brackets.keys()].filter((i) => brackets[i].upTo !== null);
            const ltcgCeilings = [...finiteIndices(tax.ltcgBrackets), undefined];
            const incomeCeilings = [...finiteIndices(tax.federalBrackets), undefined];
            const rv = [];
            for (const categoryOrder of CATEGORY_ORDERS) {
                for (const ltcgCeilingBracket of ltcgCeilings) {
                    for (const incomeCeilingBracket of incomeCeilings) {
                        rv.push(categoryOrderCandidate(categoryOrder, ltcgCeilingBracket, incomeCeilingBracket, tax.ltcgBrackets, tax.federalBrackets));
                    }
                }
            }
            return rv;
        },
        apply: (data, candidate) => {
            data.Cash.categoryOrder = candidate.categoryOrder;
            data.Cash.ltcgCeilingBracket = candidate.ltcgCeilingBracket;
            data.Cash.incomeCeilingBracket = candidate.incomeCeilingBracket;
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
    // existed, every candidate scored the same, or every candidate ran out
    // of money (a tie at 0 for a different reason than "this variable
    // doesn't matter"). All are collapsed to one flagged line instead of a
    // table that looks informative but isn't.
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
        if (netWorth.all[0].candidate.columns) {
            this.printColumnTable(netWorth, failedYears);
        } else {
            this.printSimpleTable(netWorth, failedYears);
        }
    }

    // The common case: candidate is a primitive (or has a short toString())
    // that reads fine as a single column.
    printSimpleTable(netWorth, failedYears) {
        console.log(`  ${'Candidate'.padStart(9)}   ${'Net Worth'.padStart(12)}`);
        for (const { candidate, score } of netWorth.all) {
            const marker = candidate === netWorth.best ? '  <- best' : '';
            console.log(`  ${String(candidate).padStart(9)}   ${this.formatScore(candidate, score, failedYears).padStart(12)}${marker}`);
        }
    }

    // For a candidate with multiple independently-meaningful fields (e.g.
    // category order crossed with two ceilings) -- a real table, one
    // column per candidate.columns key plus Net Worth, widths computed
    // from the longest value (including header) in each column.
    printColumnTable(netWorth, failedYears) {
        const keys = Object.keys(netWorth.all[0].candidate.columns);
        const headers = [...keys, 'Net Worth'];
        const rows = netWorth.all.map(({ candidate, score }) => [
            ...keys.map((k) => candidate.columns[k]),
            this.formatScore(candidate, score, failedYears),
        ]);
        const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
        // First column is the descriptive label (category order); every
        // other column is a number and reads better right-justified.
        const line = (cells) => cells.map((c, i) => (i === 0 ? c.padEnd(widths[i]) : c.padStart(widths[i]))).join('   ');
        console.log(`  ${line(headers)}`);
        netWorth.all.forEach(({ candidate }, i) => {
            const marker = candidate === netWorth.best ? '  <- best' : '';
            console.log(`  ${line(rows[i])}${marker}`);
        });
    }

    // Runs every variables entry in sequence, printing a candidate/net-worth
    // table for each -- a greedy/coordinate-ascent search, not a joint
    // search over the full cross product of every variable (which grows
    // combinatorially as more variables are added). Each variable's grid is
    // evaluated against a `base` config carrying forward the winning
    // candidate of every variable already run, and its own winner is then
    // folded into `base` before the next variable runs. This can miss the
    // true joint optimum (coordinate ascent doesn't guarantee it, and a
    // different variable order can land on a different combination), but is
    // far cheaper than evaluating every combination and a real improvement
    // over evaluating each variable in isolation against configData's own
    // literal values, which ignored every other variable's optimum entirely.
    // `OPTIMIZE_VARIABLES` currently holds just one entry (withdrawal
    // category order + ceilings -- SS claim age was removed, see CLAUDE.md's
    // Optimize Variables), so this machinery's multi-variable ordering
    // concerns don't currently bite in practice, but stay in place for
    // whenever a second variable is added back.
    runAll(configData, classes, variables = OPTIMIZE_VARIABLES) {
        const base = structuredClone(configData);
        for (const variable of variables) {
            const candidates = variable.candidates(base);
            // Keyed by candidate: which ones hit InsufficientFundsError and
            // in what year, so the rest of the grid keeps running instead
            // of the whole process aborting on the first candidate that
            // runs out of money.
            const failedYears = new Map();
            const evaluate = (candidate) => {
                const { config, bookkeeper } = this.buildPipeline(base, classes, variable, candidate);
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
            this.printBestBalances(base, classes, variable, rv.best, failedYears);
            variable.apply(base, rv.best);
        }
    }

    // Re-runs just the winning candidate (evaluate() didn't keep any
    // Bookkeeper around -- rebuilding once here is far cheaper than holding
    // one per candidate in memory for the whole grid) to print its ending
    // account balances (Bookkeeper.report()) under the net-worth table, so
    // it's not just one summed number -- which account actually ended up
    // holding the difference is exactly the kind of thing a single Net
    // Worth score hides.
    printBestBalances(base, classes, variable, best, failedYears) {
        if (failedYears.has(best)) {
            return;
        }
        const { config, bookkeeper } = this.buildPipeline(base, classes, variable, best);
        new Simulator({ bookkeeper, config }).run();
        console.log('  Ending balances (best candidate):');
        console.log(bookkeeper.report());
    }
}
