import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TaxCalculator } from '../src/TaxCalculator.js';
import { Config } from '../src/Config.js';
import { Bookkeeper } from '../src/Bookkeeper.js';
import { JournalEntry } from '../src/JournalEntry.js';
import { Posting } from '../src/Posting.js';

const config = new Config({
    TaxCalculator: {
        balance: 5000,
        federalBrackets: [
            { rate: 0.10, upTo: 10000 },
            { rate: 0.12, upTo: 40000 },
            { rate: 0.22, upTo: null },
        ],
        stateRate: 0.044,
    },
});

test('federal applies progressive brackets', () => {
    const c = new TaxCalculator({ name: 'Tax', config });
    assert.equal(c.federal(50000), 10000 * 0.10 + 30000 * 0.12 + 10000 * 0.22);
});

test('federal stays within the first bracket for low income', () => {
    const c = new TaxCalculator({ name: 'Tax', config });
    assert.equal(c.federal(5000), 5000 * 0.10);
});

test('state applies a flat rate', () => {
    const c = new TaxCalculator({ name: 'Tax', config });
    assert.equal(c.state(50000), 50000 * 0.044);
});

test('calculate returns federal, state, and total', () => {
    const c = new TaxCalculator({ name: 'Tax', config });
    const rv = c.calculate(50000);
    assert.equal(rv.federal, 6800);
    assert.equal(rv.state, 2200);
    assert.equal(rv.total, 9000);
});

test('balance starts from the configured opening value, like any account', () => {
    const c = new TaxCalculator({ name: 'Tax', config });
    assert.equal(c.balance, 5000);
});

test('runYear sets balance from this year\'s posted ordinary income and returns nothing', () => {
    const c = new TaxCalculator({ name: 'Tax', config });
    const bookkeeper = new Bookkeeper({ accounts: [] });
    bookkeeper.post(new JournalEntry({
        year: 2026,
        category: 'income',
        postings: [
            new Posting({ account: 'OrdinaryIncome', amount: 60000 }),
            new Posting({ account: 'TradIra', amount: -60000 }),
        ],
    }));

    const rv = c.runYear({ year: 2026, bookkeeper });

    assert.equal(rv, undefined);
    assert.equal(c.balance, c.calculate(60000).total);
});

test('due returns the account name and the amount owed', () => {
    const c = new TaxCalculator({ name: 'Tax', config });
    assert.deepEqual(c.due(), { account: 'Tax', amount: 5000 });
});
