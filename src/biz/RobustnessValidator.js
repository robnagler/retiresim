import { Base } from './Base.js';
import { Config } from './Config.js';
import { Bookkeeper } from './Bookkeeper.js';
import { Simulator } from './Simulator.js';
import { InsufficientFundsError } from './InsufficientFundsError.js';
import { buildReturnSequence } from './HistoricalReturns.js';

const DEFAULT_TRIALS = 200;

// Runs as a separate step AFTER the optimizer, not as part of it --
// main.js's --robustness mode takes configData exactly as given (same
// "no candidate substitution" contract as --debug: whatever categoryOrder/
// ceilings/claimAge are already sitting in cfg.json, presumably the
// optimizer's own winning values copied in by hand) and stress-tests THAT
// one plan against many different random historical-return sequences,
// instead of searching for a better plan. It answers "how fragile is the
// plan we already picked," not "what's the best plan." Unlike every other
// input in this project, the historical-return data itself is NOT
// configurable via cfg.json (see HistoricalReturns.js) -- it's a fact
// about market history, not a per-user assumption.
export class RobustnessValidator extends Base {
    // One Bookkeeper/Simulator per trial, each with its own sampled
    // return sequence (buildReturnSequence()'s trial parameter selects a
    // well-separated slice of RandomTable -- see RandomTable.js) so no two
    // trials draw the identical sequence. InsufficientFundsError is caught
    // per trial, same pattern Optimizer.runAll() already uses, so one bad
    // trial doesn't abort the whole batch.
    run(configData, classes, trials = DEFAULT_TRIALS) {
        const { startYear, endYear } = configData.Simulator;
        const results = [];
        for (let trial = 0; trial < trials; trial++) {
            const config = new Config(structuredClone(configData));
            const bookkeeper = new Bookkeeper({ config, classes });
            bookkeeper.economy.setHistoricalReturns(buildReturnSequence({ startYear, endYear, trial }));
            try {
                new Simulator({ bookkeeper, config }).run();
                results.push({ trial, netWorth: bookkeeper.netWorth(), failedYear: null });
            } catch (err) {
                if (!(err instanceof InsufficientFundsError)) {
                    throw err;
                }
                results.push({ trial, netWorth: 0, failedYear: err.year });
            }
        }
        return results;
    }

    // A single Net Worth number, the way the optimizer reports one, would
    // hide exactly what this exists to surface: how often the plan fails
    // outright, and how wide the outcome spread is, not just its average.
    report(results) {
        const failed = results.filter((r) => r.failedYear !== null);
        const netWorths = results.map((r) => r.netWorth).sort((a, b) => a - b);
        const percentile = (p) => netWorths[Math.floor(p * (netWorths.length - 1))];
        const insolventRate = (100 * failed.length) / results.length;
        const lines = [`Robustness check: ${results.length} trials`];
        lines.push(`  Insolvent: ${failed.length} (${insolventRate.toFixed(1)}%)`);
        if (failed.length) {
            const years = failed.map((r) => r.failedYear);
            // Range alone doesn't say whether failures cluster tightly
            // around one point in the horizon or spread evenly across it --
            // sigma (population standard deviation, describing this
            // specific run's failures, not estimating some larger
            // population) does.
            const mean = years.reduce((a, y) => a + y, 0) / years.length;
            const variance = years.reduce((a, y) => a + (y - mean) ** 2, 0) / years.length;
            const sigma = Math.sqrt(variance);
            lines.push(`    Failure year range: ${Math.min(...years)}-${Math.max(...years)} (mean ${mean.toFixed(1)}, sigma ${sigma.toFixed(1)})`);
        }
        lines.push(`  Net worth -- min: ${netWorths[0].toFixed(0)}  p10: ${percentile(0.1).toFixed(0)}  median: ${percentile(0.5).toFixed(0)}  p90: ${percentile(0.9).toFixed(0)}  max: ${netWorths[netWorths.length - 1].toFixed(0)}`);
        return lines.join('\n');
    }
}
