import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Account } from '../../src/biz/Account.js';
import { Config } from '../../src/biz/Config.js';
import { FakeBookkeeper } from '../support/FakeBookkeeper.js';

const build = () => new Account({ config: new Config({ Account: { balance: 1000 } }) });

test('grow compounds the balance by rate', () => {
    const a = build();
    a.grow(0.05);
    assert.equal(a.balance, 1050);
});

test('deposit increases the balance', () => {
    const a = build();
    a.deposit(250);
    assert.equal(a.balance, 1250);
});

test('withdraw decreases the balance', () => {
    const a = build();
    a.withdraw(400);
    assert.equal(a.balance, 600);
});

test('withdraw throws when amount exceeds balance', () => {
    const config = new Config({ Test: { balance: 1000 } });
    const a = new Account({ name: 'Test', config });
    assert.throws(() => a.withdraw(1001), /amount=1001.*balance=1000/);
});

test('growthRate defaults to Economy.sp500Rate', () => {
    const a = build();
    const bookkeeper = new FakeBookkeeper({ economy: { sp500Rate: 0.07 } });

    assert.equal(a.growthRate(bookkeeper), 0.07);
});

test('runYear grows the balance via growthRate() and posts the change', () => {
    const a = build();
    const bookkeeper = new FakeBookkeeper({ economy: { sp500Rate: 0.05 } });

    a.runYear({ year: 2026, bookkeeper });

    assert.equal(a.balance, 1050);
    assert.deepEqual(bookkeeper.ledger, [{ year: 2026, category: 'growth', source: 'UnrealizedGrowth', dest: 'Account', amount: 50 }]);
});
