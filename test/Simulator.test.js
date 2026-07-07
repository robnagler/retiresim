import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simulator } from '../src/Simulator.js';
import { Bookkeeper } from '../src/Bookkeeper.js';
import { Account } from '../src/Account.js';
import { Mortgage } from '../src/Mortgage.js';

test('run grows an account and pays down a mortgage over multiple years, reconciling every year', () => {
    const account = new Account({ name: 'Taxable', balance: 1000, rate: 0.05, priority: 0 });
    const mortgage = new Mortgage({ name: 'Mortgage', balance: 200000, rate: 0.06, monthlyPayment: 1200, priority: 1 });
    const bookkeeper = new Bookkeeper({ accounts: [account, mortgage] });
    const simulator = new Simulator({ bookkeeper, startYear: 2026, endYear: 2030 });

    simulator.run();

    assert.ok(Math.abs(account.balance - 1000 * 1.05 ** 5) < 0.01);
    assert.ok(mortgage.balance < 200000);

    let b = 200000;
    for (let y = 2026; y <= 2030; y++) {
        const c = bookkeeper.balanceChange('Mortgage', y);
        assert.ok(c < 0);
        b += c;
    }
    assert.ok(Math.abs(mortgage.balance - b) < 0.01);
});

test('run throws immediately if a single year fails to reconcile', () => {
    const account = new Account({ name: 'Taxable', balance: 1000, rate: 0.05, priority: 0 });
    const bookkeeper = new Bookkeeper({ accounts: [account] });
    const simulator = new Simulator({ bookkeeper, startYear: 2026, endYear: 2026 });
    account.runYear = () => {
        account.balance += 999;
    };

    assert.throws(() => simulator.run(), /year=2026/);
});
