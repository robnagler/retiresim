import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simulator } from '../src/Simulator.js';
import { Bookkeeper } from '../src/Bookkeeper.js';
import { Account } from '../src/Account.js';
import { Mortgage } from '../src/Mortgage.js';
import { Cash } from '../src/Cash.js';
import { Config } from '../src/Config.js';

test('run grows an account and pays down a mortgage over multiple years, reconciling every year', () => {
    const config = new Config({
        Cash: {
            balance: 0,
            withdrawalOrder: [{ name: 'Account', balance: 1000000, rate: 0.05 }],
            spendingOrder: [{ name: 'Mortgage', balance: -200000, rate: 0.06, endYear: 2055 }],
        },
        Simulator: { startYear: 2026, endYear: 2030 },
    });
    const bookkeeper = new Bookkeeper({ config, classes: { Account, Mortgage, Cash } });
    const account = bookkeeper.accounts.find((a) => a.name === 'Account');
    const mortgage = bookkeeper.accounts.find((a) => a.name === 'Mortgage');
    const simulator = new Simulator({ bookkeeper, config });

    simulator.run();

    assert.ok(mortgage.balance > -200000);

    let b = -200000;
    for (let y = 2026; y <= 2030; y++) {
        const c = bookkeeper.balanceChange('Mortgage', y);
        assert.ok(c > 0);
        b += c;
    }
    assert.ok(Math.abs(mortgage.balance - b) < 0.01);
    assert.ok(account.balance > 0);
});

test('run calls the optional onYear callback once per simulated year, after that year runs', () => {
    const config = new Config({
        Cash: {
            balance: 0,
            withdrawalOrder: [{ name: 'Account', balance: 1000, rate: 0.05 }],
            spendingOrder: [],
        },
        Simulator: { startYear: 2026, endYear: 2028 },
    });
    const bookkeeper = new Bookkeeper({ config, classes: { Account, Cash } });
    const simulator = new Simulator({ bookkeeper, config });
    const seen = [];

    simulator.run((year) => seen.push({ year, balanceChange: bookkeeper.balanceChange('Account', year) }));

    assert.deepEqual(seen.map((s) => s.year), [2026, 2027, 2028]);
    assert.ok(seen.every((s) => s.balanceChange > 0));
});

test('run throws immediately if a single year fails to reconcile', () => {
    const config = new Config({
        Cash: {
            balance: 0,
            withdrawalOrder: [{ name: 'Account', balance: 1000, rate: 0.05 }],
            spendingOrder: [],
        },
        Simulator: { startYear: 2026, endYear: 2026 },
    });
    const bookkeeper = new Bookkeeper({ config, classes: { Account, Cash } });
    const simulator = new Simulator({ bookkeeper, config });
    const account = bookkeeper.accounts[0];
    account.runYear = () => {
        account.balance += 999;
    };

    assert.throws(() => simulator.run(), /year=2026/);
});
