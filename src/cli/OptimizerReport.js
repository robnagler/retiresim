// Owns the CLI's console reporting for Optimizer.runAll()'s results --
// split out so Optimizer.js (src/biz/) can stay IO-less, the same split
// RobustnessValidator.js already has between report() building a string
// and main.js printing it. Every method here builds lines/strings; only
// main.js actually calls console.log.
export class OptimizerReport {
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
    netWorthTableLines(label, netWorth, failedYears) {
        if (failedYears.size === netWorth.all.length) {
            const lines = [`\n${label} -- every candidate ran out of money:`];
            for (const { candidate } of netWorth.all) {
                lines.push(`  ${String(candidate).padStart(9)}   ${this.formatScore(candidate, 0, failedYears).padStart(12)}`);
            }
            return lines;
        }
        if (netWorth.all.length === 1) {
            return [`\n${label} -- only one legal candidate (${netWorth.best}), net worth ${this.formatScore(netWorth.best, netWorth.score, failedYears)}`];
        }
        const scores = netWorth.all.map((r) => r.score);
        if (Math.max(...scores) - Math.min(...scores) < 0.01) {
            return [`\n${label} -- no effect on net worth (all ${netWorth.all.length} candidates tie at ${netWorth.score.toFixed(0)})`];
        }
        const lines = [`\n${label}`];
        if (netWorth.all[0].candidate.columns) {
            lines.push(...this.columnTableLines(netWorth, failedYears));
        } else {
            lines.push(...this.simpleTableLines(netWorth, failedYears));
        }
        return lines;
    }

    // The common case: candidate is a primitive (or has a short toString())
    // that reads fine as a single column.
    simpleTableLines(netWorth, failedYears) {
        const lines = [`  ${'Candidate'.padStart(9)}   ${'Net Worth'.padStart(12)}`];
        for (const { candidate, score } of netWorth.all) {
            const marker = candidate === netWorth.best ? '  <- best' : '';
            lines.push(`  ${String(candidate).padStart(9)}   ${this.formatScore(candidate, score, failedYears).padStart(12)}${marker}`);
        }
        return lines;
    }

    // For a candidate with multiple independently-meaningful fields (e.g.
    // category order crossed with two ceilings) -- a real table, one
    // column per candidate.columns key plus Net Worth, widths computed
    // from the longest value (including header) in each column.
    columnTableLines(netWorth, failedYears) {
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
        const lines = [`  ${line(headers)}`];
        netWorth.all.forEach(({ candidate }, i) => {
            const marker = candidate === netWorth.best ? '  <- best' : '';
            lines.push(`  ${line(rows[i])}${marker}`);
        });
        return lines;
    }

    // results is Optimizer.runAll()'s return value -- one net-worth table
    // per variable, plus the winning candidate's ending balances
    // (skipped when the winner itself ran out of money, same as before).
    report(results) {
        const lines = [];
        for (const { label, netWorth, failedYears, endingBalances } of results) {
            lines.push(...this.netWorthTableLines(label, netWorth, failedYears));
            if (endingBalances != null) {
                lines.push('  Ending balances (best candidate):');
                lines.push(endingBalances);
            }
        }
        return lines.join('\n');
    }
}
