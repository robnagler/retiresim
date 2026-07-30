import { Base } from './Base.js';
import { Config } from './Config.js';
import { Bookkeeper } from './Bookkeeper.js';
import { Simulator } from './Simulator.js';
import { InsufficientFundsError } from './InsufficientFundsError.js';
import { claimAgeCandidates } from './SocialSecurity.js';

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
// OptimizerReport.netWorthTableLines() a real multi-column table instead
// of cramming everything into one long "Candidate" string -- a candidate
// this shaped (126 of them, once per category-order/ceiling-bracket
// combination) is unreadable as a single column. `toString()` is still
// needed as a fallback for the "every candidate ran out of money" list,
// which doesn't build a columnar table. ltcgBrackets/federalBrackets are
// the *current* (Simulator.startYear) bracket tables, passed in only for
// display -- the ceiling actually applied at simulation time is resolved
// fresh each year against the live, already-grown tables (see
// Cash.categoryRoom()), so the real dollar amount enforced later in the
// simulation will be higher than what's shown here.
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
    {
        label: 'Social Security claim age',
        // Revives claim age as an optimized variable (removed earlier in
        // the project's history because claiming age is a personal/health
        // decision, not something that should get automatically net-
        // worth-optimized purely on preference). This is a narrower case:
        // delaying to 70 maximizes lifetime benefit, but only when the
        // household can actually afford to bridge the gap years without
        // it -- someone with little other savings may be forced to claim
        // sooner out of necessity. run()'s own InsufficientFundsError
        // handling (score 0 for a candidate that runs out of money)
        // already implements exactly that: among feasible ages, a later
        // claim age generally scores higher (bigger permanent benefit),
        // so evaluating every candidate and taking the max naturally
        // "tries 70 and backs off" to the latest age that actually works,
        // with no separate search loop needed. Evaluated *after*
        // withdrawal order specifically -- see runAll()'s doc comment for
        // the documented bug that ordering avoids (a stale/unoptimized
        // withdrawal order upstream can make delaying look infeasible
        // when a better order would have made it work).
        candidates: (configData) => {
            const ss = (configData.Cash.incomeOrder ?? []).find((e) => e.name === 'SocialSecurity');
            // No Social Security configured at all -- nothing to search;
            // a single undefined candidate is a no-op apply() below.
            if (!ss) {
                return [undefined];
            }
            return claimAgeCandidates({ birthYear: ss.birthYear, asOfYear: configData.Simulator.startYear });
        },
        apply: (data, candidate) => {
            if (candidate === undefined) {
                return;
            }
            data.Cash.incomeOrder.find((e) => e.name === 'SocialSecurity').claimAge = candidate;
        },
    },
];

// Owns the full candidate-evaluation pipeline (Config -> Bookkeeper ->
// Simulator -> netWorth()), per CLAUDE.md's TODO: "optimizer should
// contain all the optimization stuff including running the simulator."
// Deliberately IO-less -- runAll() returns data, it never touches
// console.log itself. src/cli/OptimizerReport.js owns turning that data
// into the CLI's printed tables (same split RobustnessValidator.js
// already has between report() building a string and main.js printing
// it); src/ui/app.js (once built) will render the same data into the DOM
// instead. main.js only builds classes/configData and decides whether to
// call runAll() or (in --debug) skip the optimizer entirely for a single
// raw run.
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

    // Runs every variables entry in sequence, returning one result per
    // variable -- a greedy/coordinate-ascent search, not a joint search
    // over the full cross product of every variable (which grows
    // combinatorially as more variables are added). Each variable's grid is
    // evaluated against a `base` config carrying forward the winning
    // candidate of every variable already run, and its own winner is then
    // folded into `base` before the next variable runs. This can miss the
    // true joint optimum (coordinate ascent doesn't guarantee it, and a
    // different variable order can land on a different combination), but is
    // far cheaper than evaluating every combination and a real improvement
    // over evaluating each variable in isolation against configData's own
    // literal values, which ignored every other variable's optimum entirely.
    // `OPTIMIZE_VARIABLES` holds withdrawal category order + ceilings
    // first, then Social Security claim age -- deliberately in that
    // order, not the reverse. A real bug from this project's history
    // (see CLAUDE.md's Optimize Variables) happened when claim age was
    // evaluated *first*: every claim-age candidate was scored against
    // whatever withdrawal order/ceilings happened to already be sitting
    // in the config, unoptimized, which could make delaying claim age
    // look infeasible even when a better withdrawal order would have
    // made it work. Evaluating withdrawal order first means claim age is
    // always judged against the best-known withdrawal strategy, not a
    // stale or default one.
    runAll(configData, classes, variables = OPTIMIZE_VARIABLES) {
        const base = structuredClone(configData);
        const results = [];
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
            const netWorth = this.run(candidates, evaluate);
            const { endingBalances, netWorthByYear } = this.bestCandidateDetail(base, classes, variable, netWorth.best, failedYears);
            results.push({ label: variable.label, netWorth, failedYears, endingBalances, netWorthByYear });
            variable.apply(base, netWorth.best);
        }
        return results;
    }

    // Re-runs just the winning candidate (evaluate() didn't keep any
    // Bookkeeper around -- rebuilding once here is far cheaper than holding
    // one per candidate in memory for the whole grid) to capture its ending
    // account balances (Bookkeeper.report()) and a year-by-year net-worth
    // series -- which account actually ended up holding the difference,
    // and how the winning strategy trends over time, are exactly what a
    // single Net Worth score hides. null/null when the winner itself ran
    // out of money -- there's nothing meaningful to show.
    bestCandidateDetail(base, classes, variable, best, failedYears) {
        if (failedYears.has(best)) {
            return { endingBalances: null, netWorthByYear: null };
        }
        const { config, bookkeeper } = this.buildPipeline(base, classes, variable, best);
        const netWorthByYear = [];
        new Simulator({ bookkeeper, config }).run((year) => {
            netWorthByYear.push({ year, netWorth: bookkeeper.netWorth() });
        });
        return { endingBalances: bookkeeper.report(), netWorthByYear };
    }
}
