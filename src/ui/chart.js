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

// Buckets the trials' ending net worth for the distribution curve.
// Returns {x, label, count} per bin, lowest first, where x is the bin's
// lower bound in dollars -- a number rather than a category, since the
// chart plots it against a logarithmic axis.
//
// Bins are equal width in log space, not in dollars: outcomes span orders
// of magnitude, so equal dollar widths put nearly every trial in the first
// bucket and leave the rest of the axis empty.
//
// Trials that ran out of money are excluded rather than binned. They end
// at exactly zero, which a logarithmic axis cannot place at all, and
// lumping them into the lowest positive bin would misread as "survived,
// barely" -- the opposite of what happened. How many there were is
// reported in words beside the chart, where it is a headline number rather
// than a bar to be squinted at. A run where every trial failed has nothing
// to plot and returns no bins.
export function netWorthBins(results, binCount = DEFAULT_BINS) {
    const values = results.map((r) => r.netWorth).filter((value) => value > 0);
    if (!values.length) {
        return [];
    }
    const low = Math.min(...values);
    const high = Math.max(...values);
    if (low === high) {
        return [{ x: low, label: CURRENCY.format(low), count: values.length }];
    }
    const logLow = Math.log10(low);
    const width = (Math.log10(high) - logLow) / binCount;
    const bins = Array.from({ length: binCount }, (unused, i) => {
        const x = 10 ** (logLow + i * width);
        return { x, label: CURRENCY.format(x), count: 0 };
    });
    for (const value of values) {
        // The maximum would land one past the end by the same arithmetic
        // every other value uses, so it goes in the top bin instead.
        bins[Math.min(binCount - 1, Math.floor((Math.log10(value) - logLow) / width))].count += 1;
    }
    return bins;
}

// results is RobustnessValidator.run()'s array of {trial, netWorth,
// failedYear} -- one entry per sampled market-history trial.
export function renderRobustnessChart(canvas, results, ChartCtor = globalThis.Chart) {
    const bins = netWorthBins(results);
    return new ChartCtor(canvas, {
        // A line over the bins rather than bars: it reads as the shape of
        // the distribution, which is the question -- how tightly the
        // outcomes cluster and how long the tail is -- rather than as a
        // count of trials in each bucket, which no one needs exactly.
        type: 'line',
        data: {
            datasets: [{
                label: 'Trials',
                data: bins.map((bin) => ({ x: bin.x, y: bin.count })),
                borderColor: '#0369a1',
                backgroundColor: 'rgba(3, 105, 161, 0.1)',
                fill: true,
                tension: 0.3,
                pointRadius: 0,
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
                x: {
                    type: 'logarithmic',
                    title: { display: true, text: 'Ending net worth' },
                    ticks: { callback: (value) => CURRENCY.format(value) },
                },
                y: { title: { display: true, text: 'Trials' }, beginAtZero: true },
            },
        },
    });
}
