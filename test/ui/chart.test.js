import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderNetWorthChart } from '../../src/ui/chart.js';

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
