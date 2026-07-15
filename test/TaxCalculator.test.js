import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TaxCalculator } from '../src/TaxCalculator.js';
import { Config } from '../src/Config.js';
import { Bookkeeper } from '../src/Bookkeeper.js';
import { Cash } from '../src/Cash.js';
import { JournalEntry } from '../src/JournalEntry.js';
import { Posting } from '../src/Posting.js';

const config = new Config({
    Cash: { balance: 0, withdrawalOrder: [], spendingOrder: [] },
    Tax: {
        balance: -5000,
        federalBrackets: [
            { rate: 0.10, upTo: 10000 },
            { rate: 0.12, upTo: 40000 },
            { rate: 0.22, upTo: null },
        ],
        ltcgBrackets: [
            { rate: 0.00, upTo: 40000 },
            { rate: 0.15, upTo: 100000 },
            { rate: 0.20, upTo: null },
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

test('ltcg is untaxed when ordinary income plus gains stay within the 0% bracket', () => {
    const c = new TaxCalculator({ name: 'Tax', config });
    assert.equal(c.ltcg(20000, 10000), 0);
});

test('ltcg stacks on top of ordinary income, splitting across brackets it straddles', () => {
    const c = new TaxCalculator({ name: 'Tax', config });
    // floor=35000, top=45000: 5000 in the 0% bracket (35000-40000), 5000 in the 15% bracket (40000-45000)
    assert.equal(c.ltcg(35000, 10000), 5000 * 0.15);
});

test('ltcg is taxed entirely at the top bracket rate when ordinary income already exceeds it', () => {
    const c = new TaxCalculator({ name: 'Tax', config });
    assert.equal(c.ltcg(150000, 50000), 50000 * 0.20);
});

test('ltcg is zero when there are no gains', () => {
    const c = new TaxCalculator({ name: 'Tax', config });
    assert.equal(c.ltcg(50000, 0), 0);
});

test('calculate returns federal, state, and total for ordinary income alone', () => {
    const c = new TaxCalculator({ name: 'Tax', config });
    const rv = c.calculate({ ordinaryIncome: 50000 });
    assert.equal(rv.federal, 6800);
    assert.equal(rv.state, 2200);
    assert.equal(rv.total, 9000);
});

test('calculate adds ltcg into federal and folds gains into the state\'s flat-rate base', () => {
    const c = new TaxCalculator({ name: 'Tax', config });
    const rv = c.calculate({ ordinaryIncome: 35000, gains: 10000 });
    assert.equal(rv.federal, c.federal(35000) + c.ltcg(35000, 10000));
    assert.equal(rv.state, 45000 * 0.044);
    assert.equal(rv.total, rv.federal + rv.state);
});

test('balance starts from the configured opening value, like any account', () => {
    const c = new TaxCalculator({ name: 'Tax', config });
    assert.equal(c.balance, -5000);
});

test('runYear posts last year\'s liability (the current balance) as owed, then clears the balance to zero', () => {
    const c = new TaxCalculator({ name: 'Tax', config });
    const bookkeeper = new Bookkeeper({ config, classes: { Cash } });

    const rv = c.runYear({ year: 2026, bookkeeper });

    assert.equal(rv, undefined);
    assert.equal(c.owed, 5000);
    assert.equal(c.balance, 0);
    assert.equal(bookkeeper.balanceChange('Tax', 2026), 5000);
});

test('prepareNextYear sets balance to a negative liability from this year\'s posted ordinary income and returns nothing', () => {
    const c = new TaxCalculator({ name: 'Tax', config });
    const bookkeeper = new Bookkeeper({ config, classes: { Cash } });
    bookkeeper.post(new JournalEntry({
        year: 2026,
        category: 'income',
        source: new Posting({ account: 'TradIra', amount: -60000 }),
        dest: new Posting({ account: 'OrdinaryIncome', amount: 60000 }),
    }));

    const rv = c.prepareNextYear({ year: 2026, bookkeeper });

    assert.equal(rv, undefined);
    assert.equal(c.balance, -c.calculate({ ordinaryIncome: 60000, gains: 0 }).total);
    assert.equal(bookkeeper.balanceChange('Tax', 2026), c.balance - (-5000));
});

test('prepareNextYear also pulls this year\'s posted LtcgIncome into the liability calc', () => {
    const c = new TaxCalculator({ name: 'Tax', config });
    const bookkeeper = new Bookkeeper({ config, classes: { Cash } });
    bookkeeper.post(new JournalEntry({
        year: 2026,
        category: 'income',
        source: new Posting({ account: 'TradIra', amount: -60000 }),
        dest: new Posting({ account: 'OrdinaryIncome', amount: 60000 }),
    }));
    bookkeeper.post(new JournalEntry({
        year: 2026,
        category: 'ltcg',
        source: new Posting({ account: 'IncomeEarned', amount: -15000 }),
        dest: new Posting({ account: 'LtcgIncome', amount: 15000 }),
    }));

    c.prepareNextYear({ year: 2026, bookkeeper });

    assert.equal(c.balance, -c.calculate({ ordinaryIncome: 60000, gains: 15000 }).total);
});

test('due returns a distinct paid-tax account, not the account\'s own name, and the amount runYear stashed as owed', () => {
    const c = new TaxCalculator({ name: 'Tax', config });
    const bookkeeper = new Bookkeeper({ config, classes: { Cash } });
    c.runYear({ year: 2026, bookkeeper });
    assert.deepEqual(c.due(), { account: 'TaxPaid', amount: 5000 });
});
