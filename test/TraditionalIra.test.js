import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TraditionalIra } from '../src/TraditionalIra.js';

test('withdraw treats the entire amount as taxable income', () => {
    const a = new TraditionalIra({ name: 'TradIra', balance: 1000 });
    const rv = a.withdraw(400);
    assert.equal(rv.balance, 600);
    assert.equal(rv.income, 400);
    assert.equal(a.balance, 600);
});

test('withdraw throws when amount exceeds balance', () => {
    const a = new TraditionalIra({ name: 'TradIra', balance: 1000 });
    assert.throws(() => a.withdraw(1001), /amount=1001 class=TraditionalIra name=TradIra balance=1000/);
});
