import { test } from 'node:test';
import assert from 'node:assert/strict';
import { netWorthBins, renderAccountsChart, renderNetWorthChart, renderRobustnessChart } from '../../src/ui/chart.js';

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

test('renderNetWorthChart builds a line chart with one point per series entry, in order', () => {
    const series = [
        { year: 2026, netWorth: 100000 },
        { year: 2027, netWorth: 110000 },
        { year: 2028, netWorth: 95000 },
    ];
    const canvas = {};

    const chart = renderNetWorthChart(canvas, series, FakeChart);

    assert.ok(chart instanceof FakeChart);
    assert.equal(chart.canvas, canvas);
    assert.equal(chart.config.type, 'line');
    assert.deepEqual(chart.config.data.labels, [2026, 2027, 2028]);
    assert.equal(chart.config.data.datasets.length, 1);
    assert.equal(chart.config.data.datasets[0].label, 'Net Worth');
    assert.deepEqual(chart.config.data.datasets[0].data, [100000, 110000, 95000]);
});

test('renderNetWorthChart handles an empty series without throwing', () => {
    const chart = renderNetWorthChart({}, [], FakeChart);

    assert.deepEqual(chart.config.data.labels, []);
    assert.deepEqual(chart.config.data.datasets[0].data, []);
});

test('renderNetWorthChart formats the y-axis as compact currency', () => {
    const chart = renderNetWorthChart({}, [], FakeChart);

    const format = chart.config.options.scales.y.ticks.callback;
    assert.equal(format(1234567), '$1.2M');
    assert.equal(format(0), '$0');
});

const BALANCES = [
    { year: 2026, balances: { Taxable: 100, Roth: 50 } },
    { year: 2027, balances: { Taxable: 80, Roth: 60 } },
];

test('renderAccountsChart builds one dataset per account, in the order the accounts first appear', () => {
    const chart = renderAccountsChart({}, BALANCES, FakeChart);

    assert.deepEqual(chart.config.data.labels, [2026, 2027]);
    assert.deepEqual(chart.config.data.datasets.map((d) => d.label), ['Taxable', 'Roth']);
    assert.deepEqual(chart.config.data.datasets[0].data, [100, 80]);
    assert.deepEqual(chart.config.data.datasets[1].data, [50, 60]);
});

test('renderAccountsChart stacks the y-axis, so the bands add up to the net worth shown on the other chart', () => {
    assert.equal(renderAccountsChart({}, BALANCES, FakeChart).config.options.scales.y.stacked, true);
});

test('renderAccountsChart reads an account missing from a year as zero rather than a gap in the line', () => {
    const series = [
        { year: 2026, balances: { Taxable: 100 } },
        { year: 2027, balances: { Taxable: 90, Inherited: 25 } },
    ];

    const chart = renderAccountsChart({}, series, FakeChart);

    assert.deepEqual(chart.config.data.datasets.map((d) => d.label), ['Taxable', 'Inherited']);
    assert.deepEqual(chart.config.data.datasets[1].data, [0, 25]);
});

test('renderAccountsChart gives each account its own colour, and reuses them rather than running out', () => {
    const balances = {};
    for (let i = 0; i < 8; i++) {
        balances[`Account${i}`] = i;
    }

    const colors = renderAccountsChart({}, [{ year: 2026, balances }], FakeChart)
        .config.data.datasets.map((d) => d.borderColor);

    assert.equal(new Set(colors.slice(0, 6)).size, 6);
    assert.equal(colors[6], colors[0]);
});

test('netWorthBins counts every trial, spread across equal-width bins lowest first', () => {
    const results = [0, 100, 200, 300].map((netWorth) => ({ netWorth }));

    const bins = netWorthBins(results, 4);

    assert.equal(bins.length, 4);
    assert.deepEqual(bins.map((b) => b.count), [1, 1, 1, 1]);
});

test('netWorthBins puts the highest value in the top bin rather than one past the end', () => {
    const bins = netWorthBins([{ netWorth: 0 }, { netWorth: 1000 }], 4);

    assert.deepEqual(bins.map((b) => b.count), [1, 0, 0, 1]);
});

test('netWorthBins counts insolvent trials, which the validator records as zero, in the lowest bin', () => {
    const results = [{ netWorth: 0 }, { netWorth: 0 }, { netWorth: 400 }];

    assert.equal(netWorthBins(results, 4)[0].count, 2);
});

test('netWorthBins collapses to a single bin when every trial lands on the same value, instead of dividing by zero', () => {
    const bins = netWorthBins([{ netWorth: 500 }, { netWorth: 500 }], 4);

    assert.deepEqual(bins, [{ label: '$500', count: 2 }]);
});

test('renderRobustnessChart builds a bar chart of the trial counts', () => {
    const results = [0, 100, 200, 300].map((netWorth, trial) => ({ trial, netWorth, failedYear: null }));

    const chart = renderRobustnessChart({}, results, FakeChart);

    assert.equal(chart.config.type, 'bar');
    assert.equal(chart.config.data.datasets.length, 1);
    assert.equal(chart.config.data.datasets[0].data.reduce((a, b) => a + b, 0), results.length);
});
