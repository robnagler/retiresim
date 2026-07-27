import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Optimizer } from '../src/Optimizer.js';
import { Config } from '../src/Config.js';
import { Bookkeeper } from '../src/Bookkeeper.js';
import { Simulator } from '../src/Simulator.js';
import { TaxableAccount } from '../src/TaxableAccount.js';
import { LivingExpense } from '../src/LivingExpense.js';
import { Salary } from '../src/Salary.js';
import { SocialSecurity, MIN_CLAIM_AGE, MAX_CLAIM_AGE } from '../src/SocialSecurity.js';
import { Cash } from '../src/Cash.js';

test('run picks the candidate with the highest score', () => {
    const optimizer = new Optimizer();

    const rv = optimizer.run([1, 2, 3], (n) => n * 10);

    assert.equal(rv.best, 3);
    assert.equal(rv.score, 30);
});

test('run picks an interior candidate when scores are non-monotonic, not just an endpoint', () => {
    const optimizer = new Optimizer();
    // Peaks at 3, falls off on both sides -- proves the search isn't
    // accidentally just taking the first or last candidate.
    const scoreOf = { 1: 5, 2: 9, 3: 12, 4: 7, 5: 1 };

    const rv = optimizer.run([1, 2, 3, 4, 5], (n) => scoreOf[n]);

    assert.equal(rv.best, 3);
    assert.equal(rv.score, 12);
});

test('run returns one {candidate, score} entry per input candidate, in input order', () => {
    const optimizer = new Optimizer();

    const rv = optimizer.run(['a', 'b', 'c'], (s) => s.charCodeAt(0));

    assert.deepEqual(rv.all, [
        { candidate: 'a', score: 97 },
        { candidate: 'b', score: 98 },
        { candidate: 'c', score: 99 },
    ]);
});

// Integration test: proves the real Config -> Bookkeeper -> Simulator ->
// netWorth() pipeline is wired correctly (per CLAUDE.md's Optimizer Build
// Plan step 3), not just Optimizer's internal argmax. Salary's monthly
// amount exactly matches LivingExpense, so a year with Salary active draws
// nothing from TaxableAccount, and a year without it draws the full
// LivingExpense amount -- more Salary years strictly preserves more
// TaxableAccount balance, giving an unambiguous, hand-computable optimum.
test('run wired to a real Config/Bookkeeper/Simulator picks the Salary end year that preserves the most net worth', () => {
    const baseData = {
        Simulator: { startYear: 2026, endYear: 2030 },
        Cash: {
            balance: 0,
            withdrawalOrder: [{ name: 'TaxableAccount', balance: 200000, rate: 0, basis: 200000 }],
            incomeOrder: [{ name: 'Salary', balance: 0, rate: 0, monthlyAmount: 2000, endYear: 0 }],
            spendingOrder: [{ name: 'LivingExpense', balance: 24000, rate: 0 }],
        },
    };
    const classes = { TaxableAccount, LivingExpense, Salary, Cash };
    const evaluate = (candidateEndYear) => {
        const data = structuredClone(baseData);
        data.Cash.incomeOrder[0].endYear = candidateEndYear;
        const config = new Config(data);
        const bookkeeper = new Bookkeeper({ config, classes });
        new Simulator({ bookkeeper, config }).run();
        return bookkeeper.netWorth();
    };

    const rv = new Optimizer().run([2024, 2026, 2028, 2030], evaluate);

    assert.deepEqual(rv.all.map((r) => r.score), [80000, 104000, 152000, 200000]);
    assert.equal(rv.best, 2030);
    assert.equal(rv.score, 200000);
});

// Same shape as the Salary end-year test above, applied to CLAUDE.md's
// second Optimize Variable. fraMonthlyBenefit is comfortably above
// LivingExpense even at claimAge's most-reduced case (62, -40%), so once
// SocialSecurity is active it always fully covers spending, and the
// surplus (netWorth() now counts idle Cash) grows with claimAge for
// every candidate that's active the full 5-year window (62-68) --
// bigger checks each of those 5 years wins. Claiming even later (69, 70)
// starts losing whole years of coverage (birthYear+claimAge lands after
// the simulation starts, forcing a TaxableAccount-funded shortfall in
// the missed years), so the optimum lands at 68, not an endpoint --
// still unambiguous and hand-computable.
test('run wired to a real Config/Bookkeeper/Simulator picks the SS claim age that preserves the most net worth', () => {
    const baseData = {
        Simulator: { startYear: 2026, endYear: 2030 },
        Cash: {
            balance: 0,
            withdrawalOrder: [{ name: 'TaxableAccount', balance: 100000, rate: 0, basis: 100000 }],
            incomeOrder: [{ name: 'SocialSecurity', balance: 0, rate: 0, birthYear: 1958, claimAge: 0, fraMonthlyBenefit: 2000 }],
            spendingOrder: [{ name: 'LivingExpense', balance: 10000, rate: 0 }],
        },
    };
    const classes = { TaxableAccount, LivingExpense, SocialSecurity, Cash };
    const evaluate = (candidateClaimAge) => {
        const data = structuredClone(baseData);
        data.Cash.incomeOrder[0].claimAge = candidateClaimAge;
        const config = new Config(data);
        const bookkeeper = new Bookkeeper({ config, classes });
        new Simulator({ bookkeeper, config }).run();
        return bookkeeper.netWorth();
    };
    const candidates = Array.from({ length: MAX_CLAIM_AGE - MIN_CLAIM_AGE + 1 }, (_, i) => MIN_CLAIM_AGE + i);

    const rv = new Optimizer().run(candidates, evaluate);

    assert.deepEqual(rv.all.map((r) => r.score), [122000, 131600, 141200, 150800, 160400, 170000, 179600, 161360, 139280]);
    assert.equal(rv.best, 68);
    assert.equal(rv.score, 179600);
});
