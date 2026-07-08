import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CashGenerator } from '../src/CashGenerator.js';
import { Account } from '../src/Account.js';
import { TraditionalIra } from '../src/TraditionalIra.js';
import { Config } from '../src/Config.js';

test('raise withdraws from accounts in withdrawalOrder until the amount is covered', () => {
    const config = new Config({
        Account: { balance: 1000 },
        TraditionalIra: { balance: 5000 },
        CashGenerator: { withdrawalOrder: ['Taxable', 'TradIra'] },
    });
    const taxable = new Account({ name: 'Taxable', rate: 0, config });
    const tradIra = new TraditionalIra({ name: 'TradIra', rate: 0, config });
    const g = new CashGenerator({ config, accounts: [taxable, tradIra] });

    const rv = g.raise(1500);

    assert.deepEqual(rv, [
        { account: 'Taxable', amount: 1000 },
        { account: 'TradIra', amount: 500 },
    ]);
    assert.equal(taxable.balance, 0);
    assert.equal(tradIra.balance, 4500);
});

test('raise stops early once the amount is fully covered by earlier accounts', () => {
    const config = new Config({
        Account: { balance: 1000 },
        TraditionalIra: { balance: 5000 },
        CashGenerator: { withdrawalOrder: ['Taxable', 'TradIra'] },
    });
    const taxable = new Account({ name: 'Taxable', rate: 0, config });
    const tradIra = new TraditionalIra({ name: 'TradIra', rate: 0, config });
    const g = new CashGenerator({ config, accounts: [taxable, tradIra] });

    const rv = g.raise(400);

    assert.deepEqual(rv, [{ account: 'Taxable', amount: 400 }]);
    assert.equal(taxable.balance, 600);
    assert.equal(tradIra.balance, 5000);
});

test('raise throws when accounts in withdrawalOrder cannot cover the amount', () => {
    const config = new Config({
        Account: { balance: 1000 },
        CashGenerator: { withdrawalOrder: ['Taxable'] },
    });
    const taxable = new Account({ name: 'Taxable', rate: 0, config });
    const g = new CashGenerator({ config, accounts: [taxable] });

    assert.throws(() => g.raise(1500), /shortfall=500/);
});
