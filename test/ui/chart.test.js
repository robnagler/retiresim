import { test } from 'node:test';
import assert from 'node:assert/strict';
import { netWorthBins, renderNetWorthChart, renderRobustnessChart } from '../../src/ui/chart.js';

// Chart.js itself needs a real <canvas>/browser environment, which
// node --test doesn't have -- this fake constructor stands in for it,
// just capturing whatever renderNetWorthChart() passes so the mapping
// logic can be checked without a real chart ever being drawn.
class FakeChart {
    constructor(canvas, config) {
        this.canvas = canvas;
        this.config = config;
    }
}

const BALANCES = [
    { year: 2026, balances: { Taxable: 100, Roth: 50 } },
    { year: 2027, balances: { Taxable: 80, Roth: 60 } },
];

test('renderNetWorthChart builds one dataset per account, in the order the accounts first appear', () => {
    const canvas = {};

    const chart = renderNetWorthChart(canvas, BALANCES, FakeChart);

    assert.ok(chart instanceof FakeChart);
    assert.equal(chart.canvas, canvas);
    assert.equal(chart.config.type, 'line');
    assert.deepEqual(chart.config.data.labels, [2026, 2027]);
    assert.deepEqual(chart.config.data.datasets.map((d) => d.label), ['Taxable', 'Roth']);
    assert.deepEqual(chart.config.data.datasets[0].data, [100, 80]);
    assert.deepEqual(chart.config.data.datasets[1].data, [50, 60]);
});

test('renderNetWorthChart stacks the y-axis, which is what makes the top of the stack the net worth curve', () => {
    assert.equal(renderNetWorthChart({}, BALANCES, FakeChart).config.options.scales.y.stacked, true);
});

test('renderNetWorthChart has no dataset for the total, which a stacked axis would pile on top and double', () => {
    const labels = renderNetWorthChart({}, BALANCES, FakeChart).config.data.datasets.map((d) => d.label);

    assert.deepEqual(labels, ['Taxable', 'Roth']);
});

test('renderNetWorthChart reports the stacked total in the tooltip, since no band is labelled with it', () => {
    const chart = renderNetWorthChart({}, BALANCES, FakeChart);

    const footer = chart.config.options.plugins.tooltip.callbacks.footer;
    assert.equal(footer([{ parsed: { y: 100 } }, { parsed: { y: 50 } }]), 'Net worth $150');
});

test('renderNetWorthChart reads an account missing from a year as zero rather than a gap in the line', () => {
    const series = [
        { year: 2026, balances: { Taxable: 100 } },
        { year: 2027, balances: { Taxable: 90, Inherited: 25 } },
    ];

    const chart = renderNetWorthChart({}, series, FakeChart);

    assert.deepEqual(chart.config.data.datasets.map((d) => d.label), ['Taxable', 'Inherited']);
    assert.deepEqual(chart.config.data.datasets[1].data, [0, 25]);
});

test('renderNetWorthChart gives each account its own colour, and reuses them rather than running out', () => {
    const balances = {};
    for (let i = 0; i < 8; i++) {
        balances[`Account${i}`] = i;
    }

    const colors = renderNetWorthChart({}, [{ year: 2026, balances }], FakeChart)
        .config.data.datasets.map((d) => d.borderColor);

    assert.equal(new Set(colors.slice(0, 6)).size, 6);
    assert.equal(colors[6], colors[0]);
});

test('renderNetWorthChart handles an empty series without throwing', () => {
    const chart = renderNetWorthChart({}, [], FakeChart);

    assert.deepEqual(chart.config.data.labels, []);
    assert.deepEqual(chart.config.data.datasets, []);
});

test('renderNetWorthChart formats the y-axis as compact currency', () => {
    const chart = renderNetWorthChart({}, [], FakeChart);

    const format = chart.config.options.scales.y.ticks.callback;
    assert.equal(format(1234567), '$1.2M');
    assert.equal(format(0), '$0');
});

test('netWorthBins counts every trial, the ones that ran out first and then the survivors', () => {
    const bins = netWorthBins([0, 100, 1000, 10000, 100000].map((netWorth) => ({ netWorth })));

    assert.equal(bins.reduce((sum, bin) => sum + bin.count, 0), 5);
    assert.equal(bins[0].label, 'Ran out');
    assert.equal(bins[0].count, 1);
});

test('netWorthBins steps buckets by 1, 2 and 5 within each power of ten, so the labels are numbers someone would have chosen', () => {
    const bins = netWorthBins([100000, 20000000].map((netWorth) => ({ netWorth })));

    assert.deepEqual(bins.map((bin) => bin.label), [
        '$100K', '$200K', '$500K', '$1M', '$2M', '$5M', '$10M', '$20M',
    ]);
});

test('netWorthBins starts at the boundary at or below the smallest value, so nothing falls off the left', () => {
    const bins = netWorthBins([150000, 900000].map((netWorth) => ({ netWorth })));

    assert.equal(bins[0].label, '$100K');
    assert.equal(bins.reduce((sum, bin) => sum + bin.count, 0), 2);
});

test('netWorthBins puts each value in the last bucket at or below it', () => {
    const bins = netWorthBins([100, 250, 700].map((netWorth) => ({ netWorth })));

    assert.deepEqual(bins.map((bin) => [bin.label, bin.count]), [['$100', 1], ['$200', 1], ['$500', 1]]);
});

test('netWorthBins gives the failures their own labelled bucket rather than a dollar range starting at zero', () => {
    const bins = netWorthBins([{ netWorth: 0 }, { netWorth: 0 }, { netWorth: 400 }]);

    assert.equal(bins[0].label, 'Ran out');
    assert.equal(bins[0].count, 2);
    assert.equal(bins.slice(1).reduce((sum, bin) => sum + bin.count, 0), 1);
});

test('netWorthBins has no failure bucket when nothing failed, so an empty one never implies otherwise', () => {
    assert.equal(netWorthBins([{ netWorth: 400 }, { netWorth: 500 }])[0].label, '$200');
});

test('netWorthBins is only the failure bucket when every trial ran out', () => {
    assert.deepEqual(netWorthBins([{ netWorth: 0 }, { netWorth: 0 }]), [{ label: 'Ran out', count: 2 }]);
});

test('netWorthBins puts every trial in one bucket when they all land on the same value', () => {
    const bins = netWorthBins([{ netWorth: 500 }, { netWorth: 500 }]);

    assert.equal(bins.reduce((sum, bin) => sum + bin.count, 0), 2);
});

test('renderRobustnessChart builds a bar per bin, counting every trial including the ones that ran out', () => {
    const results = [0, 100, 200, 300].map((netWorth, trial) => ({ trial, netWorth, failedYear: netWorth === 0 ? 2040 : null }));

    const chart = renderRobustnessChart({}, results, FakeChart);

    assert.equal(chart.config.type, 'bar');
    assert.equal(chart.config.data.datasets.length, 1);
    assert.equal(chart.config.data.datasets[0].data.reduce((sum, count) => sum + count, 0), results.length);
    assert.equal(chart.config.data.labels[0], 'Ran out');
});
