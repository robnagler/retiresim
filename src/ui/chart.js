// Thin wrapper around the CDN-loaded Chart.js (see index.html's
// <script> tag) so app.js and the rest of the codebase never talk to the
// third-party library directly -- keeps its API surface contained to
// this one file, same spirit as every other module wrapping one
// responsibility.
//
// ChartCtor defaults to globalThis.Chart (Chart.js sets window.Chart when
// loaded via its CDN script tag; globalThis.Chart resolves the same thing
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

// series is Optimizer.runAll()'s netWorthByYear: an array of
// {year, netWorth} objects, already ordered by year.
export function renderNetWorthChart(canvas, series, ChartCtor = globalThis.Chart) {
    return new ChartCtor(canvas, {
        type: 'line',
        data: {
            labels: series.map((point) => point.year),
            datasets: [{
                label: 'Net Worth',
                data: series.map((point) => point.netWorth),
                borderColor: '#2563eb',
                backgroundColor: 'rgba(37, 99, 235, 0.1)',
                fill: true,
                tension: 0.2,
                pointRadius: 0,
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: { display: true, text: 'Net Worth Over Time' },
                legend: { display: false },
            },
            scales: {
                x: { title: { display: true, text: 'Year' } },
                y: { title: { display: true, text: 'Net Worth' }, ticks: { callback: (value) => CURRENCY.format(value) } },
            },
        },
    });
}
