import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TraditionalIra } from '../src/TraditionalIra.js';
import { Bookkeeper } from '../src/Bookkeeper.js';
import { Config } from '../src/Config.js';

test('withdraw treats the entire amount as taxable income', () => {
    const config = new Config({ TraditionalIra: { withdraw: 400 } });
    const a = new TraditionalIra({ name: 'TradIra', balance: 1000, config });
    const rv = a.withdraw(400);
    assert.equal(rv.balance, 600);
    assert.equal(rv.income, 400);
    assert.equal(a.balance, 600);
});

test('withdraw throws when amount exceeds balance', () => {
    const config = new Config({ TraditionalIra: { withdraw: 1001 } });
    const a = new TraditionalIra({ name: 'TradIra', balance: 1000, config });
    assert.throws(() => a.withdraw(1001), /amount=1001 class=TraditionalIra name=TradIra balance=1000/);
});

test('runYear grows the balance then withdraws the configured amount and reconciles', () => {
    const config = new Config({ TraditionalIra: { withdraw: 300 } });
    const a = new TraditionalIra({ name: 'TradIra', balance: 1000, rate: 0.05, config });
    const bookkeeper = new Bookkeeper({ accounts: [a] });

    bookkeeper.runYear(2026);

    assert.equal(a.balance, 1000 * 1.05 - 300);
    assert.equal(bookkeeper.balanceChange('TradIra', 2026), a.balance - 1000);
});

test('runYear throws when no withdrawal amount is configured', () => {
    const config = new Config({ TraditionalIra: {} });
    const a = new TraditionalIra({ name: 'TradIra', balance: 1000, rate: 0.05, config });
    const bookkeeper = new Bookkeeper({ accounts: [a] });

    assert.throws(() => bookkeeper.runYear(2026), /amount=undefined/);
});
