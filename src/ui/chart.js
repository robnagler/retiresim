// Thin wrapper around Chart.js, vendored at src/ext/chart.umd.js and
// loaded by index.html's <script> tag (no CDN -- the page has to work as
// a fully self-contained static site), so app.js and the rest of the
// codebase never talk to the third-party library directly -- keeps its
// API surface contained to this one file, same spirit as every other
// module wrapping one responsibility.
//
// ChartCtor defaults to globalThis.Chart (Chart.js sets window.Chart when
// loaded via that script tag; globalThis.Chart resolves the same thing
// in a browser but is also safe to reference under plain node --test,
// where it's simply undefined) -- tests pass a fake constructor instead,
// the same "fake collaborator, not the real dependency" pattern already
// used elsewhere in this project (e.g. test/support/FakeBookkeeper.js).

// Compact currency, e.g. $1.2M -- a full $1,234,567.89 would crowd the
// y-axis over a multi-decade horizon where the range easily spans
// $0 to $10M+.
const CURRENCY = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    maximumFractionDigits: 1,
});

// One colour per account, assigned by position. Six is more accounts than
// any configuration currently produces, and the modulo keeps a seventh from
// throwing rather than making the colours meaningful beyond that.
const ACCOUNT_COLORS = ['#2563eb', '#0369a1', '#0d9488', '#7c3aed', '#c2410c', '#4d7c0f'];

// The account names appearing anywhere in the series, in the order they
// first appear. Read from the data rather than from a fixed list because
// which accounts exist depends entirely on what was configured.
function accountNames(series) {
    const rv = [];
    for (const point of series) {
        for (const name of Object.keys(point.balances)) {
            if (!rv.includes(name)) {
                rv.push(name);
            }
        }
    }
    return rv;
}

// series is Optimizer.runAll()'s balancesByYear: an array of
// {year, balances} where balances maps account name to balance.
//
// One chart, not two. The accounts are exactly the accounts netWorth()
// counts (Bookkeeper.assetBalances()), so stacking them makes the top edge
// of the stack the net-worth curve itself -- drawing that curve again on
// its own chart would show the same number twice while hiding the more
// useful half, which is which accounts make it up and how that mix shifts
// as one drains and another keeps growing. The total is not a dataset of
// its own for the same reason: with a stacked axis it would be stacked on
// top of the sum and double the height. It appears in the tooltip instead.
//
// An account missing from a year reads as zero, which is what a not-yet-
// open or fully-drained account is worth.
export function renderNetWorthChart(canvas, series, ChartCtor = globalThis.Chart) {
    return new ChartCtor(canvas, {
        type: 'line',
        data: {
            labels: series.map((point) => point.year),
            datasets: accountNames(series).map((name, i) => ({
                label: name,
                data: series.map((point) => point.balances[name] ?? 0),
                borderColor: ACCOUNT_COLORS[i % ACCOUNT_COLORS.length],
                backgroundColor: ACCOUNT_COLORS[i % ACCOUNT_COLORS.length],
                fill: true,
                tension: 0.2,
                pointRadius: 0,
            })),
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                title: { display: true, text: 'Net Worth Over Time' },
                legend: { display: true, position: 'bottom' },
                tooltip: {
                    callbacks: {
                        // The number the stack adds up to, which is the one
                        // figure the chart shows everywhere and labels
                        // nowhere.
                        footer: (items) => `Net worth ${CURRENCY.format(items.reduce((sum, item) => sum + item.parsed.y, 0))}`,
                    },
                },
            },
            scales: {
                x: { title: { display: true, text: 'Year' } },
                y: { stacked: true, title: { display: true, text: 'Net Worth' }, ticks: { callback: (value) => CURRENCY.format(value) } },
            },
        },
    });
}

const DEFAULT_BINS = 12;

// Buckets the trials' ending net worth into equal-width bins for a
// histogram. Returns {label, count} per bin, lowest first.
//
// Every trial counts, including the insolvent ones, which the validator
// records as a net worth of zero -- they pile up in the lowest bin, which
// is a fair picture of the outcome, and the insolvency rate is reported as
// its own number beside the chart rather than being left to be read off a
// bar. A run where every trial lands on the same value has no width to
// divide, so it collapses to a single bin rather than dividing by zero.
export function netWorthBins(results, binCount = DEFAULT_BINS) {
    const values = results.map((r) => r.netWorth);
    const low = Math.min(...values);
    const high = Math.max(...values);
    if (low === high) {
        return [{ label: CURRENCY.format(low), count: values.length }];
    }
    const width = (high - low) / binCount;
    const bins = Array.from({ length: binCount }, (unused, i) => ({
        label: `${CURRENCY.format(low + i * width)}`,
        count: 0,
    }));
    for (const value of values) {
        // The maximum would land one past the end by the same arithmetic
        // every other value uses, so it goes in the top bin instead.
        bins[Math.min(binCount - 1, Math.floor((value - low) / width))].count += 1;
    }
    return bins;
}

// results is RobustnessValidator.run()'s array of {trial, netWorth,
// failedYear} -- one entry per sampled market-history trial.
export function renderRobustnessChart(canvas, results, ChartCtor = globalThis.Chart) {
    const bins = netWorthBins(results);
    return new ChartCtor(canvas, {
        type: 'bar',
        data: {
            labels: bins.map((bin) => bin.label),
            datasets: [{
                label: 'Trials',
                data: bins.map((bin) => bin.count),
                backgroundColor: '#0369a1',
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: { display: true, text: 'Outcomes Across Market Histories' },
                legend: { display: false },
            },
            scales: {
                x: { title: { display: true, text: 'Ending net worth' } },
                y: { title: { display: true, text: 'Trials' }, beginAtZero: true },
            },
        },
    });
}
