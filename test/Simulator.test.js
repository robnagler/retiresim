import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simulator } from '../src/Simulator.js';
import { Bookkeeper } from '../src/Bookkeeper.js';
import { Account } from '../src/Account.js';
import { Mortgage } from '../src/Mortgage.js';
import { Config } from '../src/Config.js';

test('run grows an account and pays down a mortgage over multiple years, reconciling every year', () => {
    const config = new Config({
        Bookkeeper: { accountClasses: ['Taxable', 'Mortgage'] },
        Taxable: { class: 'Account', balance: 1000, rate: 0.05, priority: 0 },
        Mortgage: { balance: 200000, rate: 0.06, monthlyPayment: 1200, priority: 1 },
        Simulator: { startYear: 2026, endYear: 2030 },
    });
    const bookkeeper = new Bookkeeper({ config, classes: { Account, Mortgage } });
    const [account, mortgage] = bookkeeper.accounts;
    const simulator = new Simulator({ bookkeeper, config });

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
    const config = new Config({
        Bookkeeper: { accountClasses: ['Taxable'] },
        Taxable: { class: 'Account', balance: 1000, rate: 0.05, priority: 0 },
        Simulator: { startYear: 2026, endYear: 2026 },
    });
    const bookkeeper = new Bookkeeper({ config, classes: { Account } });
    const simulator = new Simulator({ bookkeeper, config });
    const account = bookkeeper.accounts[0];
    account.runYear = () => {
        account.balance += 999;
    };

    assert.throws(() => simulator.run(), /year=2026/);
});
