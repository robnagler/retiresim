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

// series is Optimizer.runAll()'s netWorthByYear: an array of
// {year, netWorth} objects, already ordered by year.
export function renderNetWorthChart(canvas, series, ChartCtor = globalThis.Chart) {
    return new ChartCtor(canvas, {
        type: 'line',
        data: {
            labels: series.map((point) => point.year),
            datasets: [{ label: 'Net Worth', data: series.map((point) => point.netWorth) }],
        },
    });
}
