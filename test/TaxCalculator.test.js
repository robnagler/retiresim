import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TaxCalculator } from '../src/TaxCalculator.js';
import { Config } from '../src/Config.js';

const config = new Config({
    TaxCalculator: {
        federalBrackets: [
            { rate: 0.10, upTo: 10000 },
            { rate: 0.12, upTo: 40000 },
            { rate: 0.22, upTo: null },
        ],
        stateRate: 0.044,
        startingTax: 5000,
    },
});

test('federal applies progressive brackets', () => {
    const c = new TaxCalculator({ config });
    assert.equal(c.federal(50000), 10000 * 0.10 + 30000 * 0.12 + 10000 * 0.22);
});

test('federal stays within the first bracket for low income', () => {
    const c = new TaxCalculator({ config });
    assert.equal(c.federal(5000), 5000 * 0.10);
});

test('state applies a flat rate', () => {
    const c = new TaxCalculator({ config });
    assert.equal(c.state(50000), 50000 * 0.044);
});

test('calculate returns federal, state, and total', () => {
    const c = new TaxCalculator({ config });
    const rv = c.calculate(50000);
    assert.equal(rv.federal, 6800);
    assert.equal(rv.state, 2200);
    assert.equal(rv.total, 9000);
});

test('settle pays the configured starting amount before any income is known', () => {
    const c = new TaxCalculator({ config });
    assert.equal(c.settle(60000), 5000);
});

test('settle pays this year based on the prior year\'s income', () => {
    const c = new TaxCalculator({ config });
    c.settle(60000);
    assert.equal(c.settle(70000), c.calculate(60000).total);
});
