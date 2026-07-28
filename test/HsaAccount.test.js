import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HsaAccount } from '../src/HsaAccount.js';
import { Bookkeeper } from '../src/Bookkeeper.js';
import { Cash } from '../src/Cash.js';
import { testConfig } from './support/testConfig.js';

test('earn draws down a level, straight-line amount (zero growth) so the balance reaches exactly zero by zeroBalanceYear, tax-free', () => {
    // zeroBalanceYear=2029, year=2026 -> 4 years remaining (inclusive).
    // sp500Rate=0 (testConfig()'s default) -> straight-line: 1000/4=250/yr.
    const config = testConfig({
        Simulator: { startYear: 2026, endYear: 2030 },
        withdrawalOrder: [{ name: 'HsaAccount', balance: 1000, zeroBalanceYear: 2029 }],
    });
    const bookkeeper = new Bookkeeper({ config, classes: { HsaAccount, Cash } });

    bookkeeper.runYear(2026);

    assert.equal(bookkeeper.accounts.find((a) => a.name === 'HsaAccount').balance, 750);
    assert.equal(bookkeeper.balanceChange('OrdinaryIncome', 2026), 0);
    assert.equal(bookkeeper.balanceChange('HsaAccount', 2026), -250);
    assert.equal(bookkeeper.balanceChange('Cash', 2026), 250);
});

test('earn\'s level drawdown, computed once, zeroes the balance out by zeroBalanceYear and then draws nothing further', () => {
    // Hand-computable with growth: r=0.10, years=2 -> annuity-due level
    // withdrawal is B*r*(1+r)^(years-1) / ((1+r)^years - 1)
    // = 1000*0.10*1.1 / (1.21-1) = 110/0.21 = 523.8095238...
    // Year 1 (2026): withdraw 523.8095238, remaining 476.1904762, grows *1.1 -> 523.8095238
    // Year 2 (2027, = zeroBalanceYear): withdraw 523.8095238, remaining 0, grows *1.1 -> 0
    const config = testConfig({
        Simulator: { startYear: 2026, endYear: 2035 },
        sp500Rate: 0.10,
        withdrawalOrder: [{ name: 'HsaAccount', balance: 1000, zeroBalanceYear: 2027 }],
    });
    const bookkeeper = new Bookkeeper({ config, classes: { HsaAccount, Cash } });

    bookkeeper.runYear(2026);
    assert.ok(Math.abs(bookkeeper.accounts.find((a) => a.name === 'HsaAccount').balance - 523.8095238) < 0.0001);

    bookkeeper.runYear(2027);
    assert.ok(Math.abs(bookkeeper.accounts.find((a) => a.name === 'HsaAccount').balance) < 0.0001);

    // Past zeroBalanceYear -- no further withdrawal (just a negligible
    // growth posting on whatever float residual is left from the prior
    // two years), balance stays at approximately zero.
    bookkeeper.runYear(2028);
    assert.ok(Math.abs(bookkeeper.balanceChange('HsaAccount', 2028)) < 0.0001);
    assert.ok(Math.abs(bookkeeper.accounts.find((a) => a.name === 'HsaAccount').balance) < 0.0001);
});

test('earn throws when zeroBalanceYear is not after the year the drawdown is first computed', () => {
    const config = testConfig({
        Simulator: { startYear: 2026, endYear: 2030 },
        withdrawalOrder: [{ name: 'HsaAccount', balance: 1000, zeroBalanceYear: 2025 }],
    });
    const bookkeeper = new Bookkeeper({ config, classes: { HsaAccount, Cash } });

    assert.throws(() => bookkeeper.runYear(2026), /zeroBalanceYear=2025/);
});
