import { Base } from './Base.js';
import { Simulator } from './Simulator.js';
import { buildPipeline, candidateConfigData } from './pipeline.js';
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

// Owns the search: which candidates to try, how to score them, and which
// one won, per CLAUDE.md's TODO ("optimizer should contain all the
// optimization stuff including running the simulator"). Building a plan
// into a running simulation is pipeline.js's job, shared with the
// robustness validator and the CLI rather than owned here.
//
// Deliberately IO-less -- runAll() returns data, it never touches
// console.log itself. src/cli/OptimizerReport.js turns that data into the
// CLI's printed tables (the same split RobustnessValidator.js has between
// report() building a string and main.js printing it), and src/ui/app.js
// renders the same data into the DOM. Both callers run the identical
// search and differ only in what they do with the answer.
export class Optimizer extends Base {
    // candidates: any non-empty array. evaluate(candidate) -> number,
    // higher is better.
    run(candidates, evaluate) {
        const all = candidates.map((candidate) => ({ candidate, score: evaluate(candidate) }));
        const best = all.reduce((a, b) => (b.score > a.score ? b : a));
        return { best: best.candidate, score: best.score, all };
    }

    // Evaluates every combination of every variable's candidates and
    // returns one result per variable, each reporting that variable's own
    // candidates against the best each can reach.
    //
    // This was a greedy/coordinate-ascent search: each variable evaluated
    // against a running base carrying forward the previous winners, then
    // its own winner folded in. Cheap, and correct whenever each variable's
    // grid holds at least one workable candidate -- but that is exactly
    // what cannot be assumed. Run against a real plan whose withdrawal
    // strategy only works at a claim age of 70, every withdrawal candidate
    // failed when measured at the baseline 67, which made the first
    // variable's winner an arbitrary pick among equally-dead candidates,
    // and the claim-age search that followed was then judged against that
    // arbitrary strategy and failed everywhere too. The plan was solvent
    // the whole time; nothing in the chain could see it.
    //
    // That is the same fault CLAUDE.md records from the other direction,
    // when claim age was searched first and every age looked insolvent
    // against a stale withdrawal order. Reordering the variables only
    // moved which one got judged unfairly. Searching the combinations
    // removes the question of order entirely -- there is no "first"
    // variable to be measured against an unsearched second one.
    //
    // The cost is the product of the grid sizes rather than their sum:
    // 756 simulations rather than 132 as the variables stand, which runs
    // in about a second. A third variable would multiply that again, and
    // at that point this needs to become something cleverer than
    // exhaustive -- but a wrong answer arrived at quickly is not the
    // cheaper option.
    //
    // Each variable's table reports, for each of its candidates, the best
    // any combination containing it achieved. So a claim age's number is
    // what that claim age is worth given the best withdrawal strategy to
    // go with it, which is the question someone reading the table is
    // actually asking.
    runAll(configData, classes, variables = OPTIMIZE_VARIABLES) {
        const grids = variables.map((variable) => variable.candidates(configData));
        const combinations = grids.reduce(
            (acc, grid) => acc.flatMap((combo) => grid.map((candidate) => [...combo, candidate])),
            [[]],
        );
        // Keyed by combination: which ran out of money and in what year, so
        // the rest of the grid keeps running instead of the whole search
        // aborting on the first plan that fails.
        const failedYears = new Map();
        const evaluate = (combination) => {
            const data = combination.reduce(
                (acc, candidate, i) => candidateConfigData(acc, variables[i], candidate),
                configData,
            );
            const { config, bookkeeper } = buildPipeline(data, classes);
            try {
                new Simulator({ bookkeeper, config }).run();
                return bookkeeper.netWorth();
            } catch (err) {
                if (!(err instanceof InsufficientFundsError)) {
                    throw err;
                }
                failedYears.set(combination, err.year);
                return 0;
            }
        };
        const winner = this.run(combinations, evaluate);
        const detail = this.bestCombinationDetail(configData, classes, variables, winner.best, failedYears);
        return variables.map((variable, i) => ({
            label: variable.label,
            netWorth: this.marginal(winner, i, grids[i]),
            failedYears: this.marginalFailures(winner, i, grids[i], failedYears),
            ...detail,
        }));
    }

    // One variable's slice of the joint result: each of its candidates
    // scored by the best combination containing it, and the winner taken
    // from the globally best combination rather than from this slice, so
    // the values reported across variables are one coherent plan rather
    // than several unrelated maxima.
    marginal(winner, i, grid) {
        const all = grid.map((candidate) => ({
            candidate,
            score: Math.max(...winner.all.filter((r) => r.candidate[i] === candidate).map((r) => r.score)),
        }));
        return { best: winner.best[i], score: winner.score, all };
    }

    // A candidate counts as failed only when every combination containing
    // it ran out of money -- one that works alongside some other choice
    // has not failed, it was merely paired badly. The year reported is the
    // latest any of them reached, the best that candidate could manage.
    marginalFailures(winner, i, grid, failedYears) {
        const rv = new Map();
        for (const candidate of grid) {
            const years = winner.all
                .filter((r) => r.candidate[i] === candidate)
                .map((r) => failedYears.get(r.candidate));
            if (years.length && years.every((y) => y !== undefined)) {
                rv.set(candidate, Math.max(...years));
            }
        }
        return rv;
    }

    // The configData every variable's winning candidate applied to it --
    // the plan the optimizer actually chose, as opposed to the input it
    // started from. Needed by anything that wants to do more with that plan
    // than read its score: the robustness validator takes configData, not a
    // result, and until this existed the winning values had to be copied
    // into cfg.json by hand before --robustness could see them.
    //
    // Rebuilt from the results rather than returned by runAll(), which
    // would change its return type and every caller with it; results are in
    // the same order as variables, since runAll() pushes one per variable.
    winningConfigData(configData, results, variables = OPTIMIZE_VARIABLES) {
        const rv = structuredClone(configData);
        variables.forEach((variable, i) => variable.apply(rv, results[i].netWorth.best));
        return rv;
    }

    // Re-runs just the winning combination (evaluate() didn't keep any
    // Bookkeeper around -- rebuilding once here is far cheaper than holding
    // one per candidate in memory for the whole grid) to capture its ending
    // account balances (Bookkeeper.report()) and a year-by-year net-worth
    // series -- which account actually ended up holding the difference,
    // and how the winning strategy trends over time, are exactly what a
    // single Net Worth score hides. All null when the winner itself ran
    // out of money -- there's nothing meaningful to show. One detail for
    // the whole search, since there is one winning plan; every variable's
    // result carries the same copy of it.
    bestCombinationDetail(configData, classes, variables, best, failedYears) {
        if (failedYears.has(best)) {
            return { endingBalances: null, netWorthByYear: null, balancesByYear: null };
        }
        const data = best.reduce(
            (acc, candidate, i) => candidateConfigData(acc, variables[i], candidate),
            configData,
        );
        const { config, bookkeeper } = buildPipeline(data, classes);
        const netWorthByYear = [];
        const balancesByYear = [];
        new Simulator({ bookkeeper, config }).run((year) => {
            netWorthByYear.push({ year, netWorth: bookkeeper.netWorth() });
            // Captured per year rather than derived afterwards from the
            // ending balances: the whole point is how the split between
            // accounts moves as one is drawn down and another keeps
            // growing, which the final year alone cannot show.
            balancesByYear.push({ year, balances: bookkeeper.assetBalances() });
        });
        return { endingBalances: bookkeeper.report(), netWorthByYear, balancesByYear };
    }
}
