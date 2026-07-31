import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Optimizer, OPTIMIZE_VARIABLES } from '../../src/biz/Optimizer.js';
import { Config } from '../../src/biz/Config.js';
import { Bookkeeper } from '../../src/biz/Bookkeeper.js';
import { Simulator } from '../../src/biz/Simulator.js';
import { TaxableAccount } from '../../src/biz/TaxableAccount.js';
import { TraditionalIra } from '../../src/biz/TraditionalIra.js';
import { RothIra } from '../../src/biz/RothIra.js';
import { LivingExpense } from '../../src/biz/LivingExpense.js';
import { TaxCalculator } from '../../src/biz/TaxCalculator.js';
import { Salary } from '../../src/biz/Salary.js';
import { SocialSecurity } from '../../src/biz/SocialSecurity.js';
import { Cash } from '../../src/biz/Cash.js';
import { testConfigData, taxSpender } from '../support/testConfig.js';

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
    const baseData = testConfigData({
        Simulator: { startYear: 2026, endYear: 2030 },
        withdrawalOrder: [{ name: 'TaxableAccount', balance: 200000, basis: 200000 }],
        incomeOrder: [{ name: 'Salary', balance: 0, monthlyAmount: 2000, endYear: 0 }],
        spendingOrder: [{ name: 'LivingExpense', balance: 24000 }],
    });
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

// Same shape again, applied to CLAUDE.md's withdrawal category order +
// ceilings. Both candidates leave ltcgCeilingBracket/incomeCeilingBracket
// unset (no cap), so the only thing distinguishing the 6 candidates is
// which category is FIRST in categoryOrder -- each account has plenty of
// balance to cover
// the whole shortfall alone, so later categories are never touched. Two
// years, LivingExpense=10000/year, 0% tax-free (Roth) vs 10% ltcg
// (Taxable, basis=0 so every dollar withdrawn is pure gain) vs 30%
// ordinary income (TraditionalIra): year 1's shortfall is untaxed cash
// draw either way, but the resulting tax liability (0 / 1000 / 3000)
// has to be paid out of the SAME category again in year 2, so the three
// behaviors diverge by exactly that avoided-or-not tax.
test('run wired to a real Config/Bookkeeper/Simulator picks the withdrawal category order that avoids realizing avoidable tax', () => {
    const baseData = testConfigData({
        Simulator: { startYear: 2026, endYear: 2027 },
        withdrawalOrder: [
            { name: 'Taxable', class: 'TaxableAccount', balance: 100000, basis: 0 },
            { name: 'Trad', class: 'TraditionalIra', balance: 100000, birthYear: 2000 },
            { name: 'Roth', class: 'RothIra', balance: 100000, withdraw: 0 },
        ],
        spendingOrder: [
            { name: 'LivingExpense', balance: 10000 },
            taxSpender({ federalBrackets: [{ rate: 0.30, upTo: null }], ltcgBrackets: [{ rate: 0.10, upTo: null }], stateRate: 0 }),
        ],
    });
    const classes = { TaxableAccount, TraditionalIra, RothIra, LivingExpense, TaxCalculator, Cash };
    const evaluate = (candidate) => {
        const data = structuredClone(baseData);
        data.Cash.categoryOrder = candidate.categoryOrder;
        data.Cash.ltcgCeilingBracket = candidate.ltcgCeilingBracket;
        data.Cash.incomeCeilingBracket = candidate.incomeCeilingBracket;
        const config = new Config(data);
        const bookkeeper = new Bookkeeper({ config, classes });
        new Simulator({ bookkeeper, config }).run();
        return bookkeeper.netWorth();
    };
    // Mirrors Optimizer.js's OPTIMIZE_VARIABLES entry exactly (candidates
    // aren't imported since CATEGORY_ORDERS/categoryOrderCandidate aren't
    // exported -- this is deliberately re-derived to prove the real
    // pipeline end to end, same as the Salary end-year test above does for
    // its own variable).
    const orders = [
        ['ltcg', 'income', 'taxFree'],
        ['ltcg', 'taxFree', 'income'],
        ['income', 'ltcg', 'taxFree'],
        ['income', 'taxFree', 'ltcg'],
        ['taxFree', 'ltcg', 'income'],
        ['taxFree', 'income', 'ltcg'],
    ];
    const candidates = orders.map((categoryOrder) => ({ categoryOrder, ltcgCeilingBracket: undefined, incomeCeilingBracket: undefined }));

    const rv = new Optimizer().run(candidates, evaluate);

    assert.deepEqual(rv.all.map((r) => r.score), [279000, 279000, 277000, 277000, 280000, 280000]);
    assert.deepEqual(rv.best.categoryOrder, ['taxFree', 'ltcg', 'income']);
    assert.equal(rv.score, 280000);
});

// Integration test: runAll() wired to a real Config/Bookkeeper/Simulator,
// proving InsufficientFundsError from one candidate is caught, scored 0
// (with the failing year recorded in failedYears), and doesn't abort the
// rest of the grid. Optimizer.js is IO-less (see src/cli/OptimizerReport.js
// for the CLI's console-printing tests) -- this asserts on runAll()'s
// returned data directly instead of captured console output.
test('runAll catches InsufficientFundsError per-candidate, keeps the grid running, and returns the winner\'s detail', () => {
    const baseData = testConfigData({
        Simulator: { startYear: 2026, endYear: 2026 },
        withdrawalOrder: [{ name: 'TaxableAccount', balance: 1000, basis: 1000 }],
        spendingOrder: [{ name: 'LivingExpense', balance: 0 }],
    });
    const classes = { TaxableAccount, LivingExpense, Cash };
    // 500 is fully covered by the 1000-balance TaxableAccount; 2000 isn't.
    const variable = {
        label: 'Test spend',
        candidates: () => [500, 2000],
        apply: (data, candidate) => {
            data.Cash.spendingOrder.find((e) => e.name === 'LivingExpense').balance = candidate;
        },
    };

    const results = new Optimizer().runAll(baseData, classes, [variable]);

    assert.equal(results.length, 1);
    const { label, netWorth, failedYears, endingBalances, netWorthByYear } = results[0];
    assert.equal(label, 'Test spend');
    assert.deepEqual(netWorth.all.map((r) => r.score), [500, 0]);
    assert.equal(netWorth.best, 500);
    assert.equal(failedYears.get(2000), 2026);
    // The winner (500) didn't fail, so its detail is populated.
    assert.match(endingBalances, /TaxableAccount/);
    assert.deepEqual(netWorthByYear, [{ year: 2026, netWorth: 500 }]);
});

test('runAll captures the winner\'s per-account balances each year, adding up to that year\'s net worth', () => {
    const baseData = testConfigData({
        Simulator: { startYear: 2026, endYear: 2027 },
        withdrawalOrder: [{ name: 'TaxableAccount', balance: 1000, basis: 1000 }],
        spendingOrder: [{ name: 'LivingExpense', balance: 0 }],
    });
    const variable = {
        label: 'Test spend',
        candidates: () => [100],
        apply: (data, candidate) => {
            data.Cash.spendingOrder.find((e) => e.name === 'LivingExpense').balance = candidate;
        },
    };

    const { balancesByYear, netWorthByYear } = new Optimizer()
        .runAll(baseData, { TaxableAccount, LivingExpense, Cash }, [variable])[0];

    assert.deepEqual(balancesByYear.map((p) => p.year), [2026, 2027]);
    // No Cash key: it is swept into TaxableAccount and reported there, so
    // the chart drawn from this has one band per account someone recognises.
    assert.deepEqual(Object.keys(balancesByYear[0].balances), ['TaxableAccount']);
    balancesByYear.forEach((point, i) => {
        const total = Object.values(point.balances).reduce((a, b) => a + b, 0);
        assert.ok(Math.abs(total - netWorthByYear[i].netWorth) < 1e-9);
    });
});

test('runAll returns null balances alongside the other detail when the winner ran out of money', () => {
    const baseData = testConfigData({
        Simulator: { startYear: 2026, endYear: 2026 },
        withdrawalOrder: [{ name: 'TaxableAccount', balance: 10, basis: 10 }],
        spendingOrder: [{ name: 'LivingExpense', balance: 0 }],
    });
    const variable = {
        label: 'Test spend',
        candidates: () => [5000],
        apply: (data, candidate) => {
            data.Cash.spendingOrder.find((e) => e.name === 'LivingExpense').balance = candidate;
        },
    };

    const result = new Optimizer().runAll(baseData, { TaxableAccount, LivingExpense, Cash }, [variable])[0];

    assert.equal(result.balancesByYear, null);
    assert.equal(result.netWorthByYear, null);
});

test('winningConfigData applies every variable\'s winner to a copy, leaving the input configData untouched', () => {
    const baseData = testConfigData({
        Simulator: { startYear: 2026, endYear: 2026 },
        withdrawalOrder: [{ name: 'TaxableAccount', balance: 1000, basis: 1000 }],
        spendingOrder: [{ name: 'LivingExpense', balance: 0 }],
    });
    const variable = {
        label: 'Test spend',
        candidates: () => [100, 200],
        apply: (data, candidate) => {
            data.Cash.spendingOrder.find((e) => e.name === 'LivingExpense').balance = candidate;
        },
    };
    const optimizer = new Optimizer();
    const results = optimizer.runAll(baseData, { TaxableAccount, LivingExpense, Cash }, [variable]);

    const winning = optimizer.winningConfigData(baseData, results, [variable]);

    // 100 wins: spending less leaves more in the account.
    assert.equal(winning.Cash.spendingOrder.find((e) => e.name === 'LivingExpense').balance, 100);
    assert.equal(baseData.Cash.spendingOrder.find((e) => e.name === 'LivingExpense').balance, 0);
});

const claimAgeVariable = OPTIMIZE_VARIABLES.find((v) => v.label === 'Social Security claim age');

test('Social Security claim age variable\'s candidates() offers ages from the person\'s current age up to 70, and a single no-op candidate when Social Security isn\'t configured', () => {
    const withSS = testConfigData({
        Simulator: { startYear: 2026, endYear: 2026 },
        incomeOrder: [{ name: 'SocialSecurity', balance: 0, birthYear: 1961, claimAge: 67, fraMonthlyBenefit: 3000 }],
    });
    const withoutSS = testConfigData({ Simulator: { startYear: 2026, endYear: 2026 } });

    assert.deepEqual(claimAgeVariable.candidates(withSS), [65, 66, 67, 68, 69, 70]);
    assert.deepEqual(claimAgeVariable.candidates(withoutSS), [undefined]);
});

test('Social Security claim age variable\'s apply() sets claimAge on the SocialSecurity entry, and no-ops for the undefined (no SS) candidate', () => {
    const data = testConfigData({
        incomeOrder: [{ name: 'SocialSecurity', balance: 0, birthYear: 1961, claimAge: 67, fraMonthlyBenefit: 3000 }],
    });

    claimAgeVariable.apply(data, 70);

    assert.equal(data.Cash.incomeOrder[0].claimAge, 70);
    assert.doesNotThrow(() => claimAgeVariable.apply(testConfigData(), undefined));
});

// Integration test: proves runAll() genuinely "tries 70 and backs off" when
// savings can't bridge the gap before claiming starts, per the user's own
// framing (not just that InsufficientFundsError is caught in the abstract,
// like the generic test above). TaxableAccount only has enough for a
// fraction of one year's LivingExpense -- claiming any later than the
// earliest actionable age (65 here, since birthYear puts them already at
// 65 in the simulation's start year) leaves at least one year with no
// income and insufficient savings to bridge it, so 65 is the only
// feasible candidate and must win, even though every later age would
// otherwise pay a strictly larger permanent monthly benefit.
test('runAll wired to a real Config/Bookkeeper/Simulator backs Social Security claim age off to the earliest feasible age when savings can\'t bridge the gap', () => {
    const baseData = testConfigData({
        Simulator: { startYear: 2026, endYear: 2030 },
        withdrawalOrder: [{ name: 'TaxableAccount', balance: 15000, basis: 15000 }],
        incomeOrder: [{ name: 'SocialSecurity', balance: 0, birthYear: 1961, claimAge: 67, fraMonthlyBenefit: 3000 }],
        spendingOrder: [{ name: 'LivingExpense', balance: 20000 }],
    });
    const classes = { TaxableAccount, LivingExpense, SocialSecurity, Cash };

    const results = new Optimizer().runAll(baseData, classes, [claimAgeVariable]);

    const { netWorth, failedYears } = results[0];
    assert.equal(netWorth.best, 65);
    assert.equal(failedYears.has(65), false);
    // Every later candidate hits the shortfall the very first year --
    // the account can't cover even one full year's gap.
    for (const age of [66, 67, 68, 69, 70]) {
        assert.equal(failedYears.get(age), 2026);
    }
});

// The failure that turned this from a greedy search into a joint one, in
// miniature. Spending of 100 is affordable only alongside savings of 1500,
// and nothing else works at all. Greedy could not find that: it scored
// every spending candidate against the savings figure sitting in the base
// config, where both failed, picked the first of two equally-dead
// candidates, and then judged savings against that doomed spending -- so
// it reported a plan that works as having no solution anywhere.
//
// A real config hit exactly this: a withdrawal strategy that only survives
// at a Social Security claim age of 70, measured against the baseline 67.
test('runAll finds a combination that works even when neither variable works at the other\'s starting value', () => {
    const baseData = testConfigData({
        Simulator: { startYear: 2026, endYear: 2035 },
        withdrawalOrder: [{ name: 'TaxableAccount', balance: 100, basis: 100 }],
        spendingOrder: [{ name: 'LivingExpense', balance: 200 }],
    });
    const spending = {
        label: 'Spending',
        // The doomed one first, so the tie among failures resolves to it --
        // which is what greedy carried forward.
        candidates: () => [200, 100],
        apply: (data, candidate) => {
            data.Cash.spendingOrder.find((e) => e.name === 'LivingExpense').balance = candidate;
        },
    };
    const savings = {
        label: 'Savings',
        candidates: () => [100, 1500],
        apply: (data, candidate) => {
            const account = data.Cash.withdrawalOrder.find((e) => e.name === 'TaxableAccount');
            account.balance = candidate;
            account.basis = candidate;
        },
    };

    const results = new Optimizer().runAll(baseData, { TaxableAccount, LivingExpense, Cash }, [spending, savings]);

    assert.equal(results[0].netWorth.best, 100);
    assert.equal(results[1].netWorth.best, 1500);
    // 10 years at 100 out of 1500, with no growth and no tax.
    assert.equal(results[0].netWorth.score, 500);
    assert.equal(results[1].netWorth.score, 500);
    assert.ok(results[0].endingBalances);
});

// A candidate paired badly is not a candidate that failed -- saying
// otherwise would report spending of 100 as impossible when it is the
// winner, and the tables beside it exist to be read.
test('runAll counts a candidate as having run out of money only when every combination containing it did', () => {
    const baseData = testConfigData({
        Simulator: { startYear: 2026, endYear: 2035 },
        withdrawalOrder: [{ name: 'TaxableAccount', balance: 100, basis: 100 }],
        spendingOrder: [{ name: 'LivingExpense', balance: 200 }],
    });
    const spending = {
        label: 'Spending',
        candidates: () => [200, 100],
        apply: (data, candidate) => {
            data.Cash.spendingOrder.find((e) => e.name === 'LivingExpense').balance = candidate;
        },
    };
    const savings = {
        label: 'Savings',
        candidates: () => [100, 1500],
        apply: (data, candidate) => {
            const account = data.Cash.withdrawalOrder.find((e) => e.name === 'TaxableAccount');
            account.balance = candidate;
            account.basis = candidate;
        },
    };

    const results = new Optimizer().runAll(baseData, { TaxableAccount, LivingExpense, Cash }, [spending, savings]);

    // 200 fails at both savings levels; 100 works at one of them.
    assert.ok(results[0].failedYears.has(200));
    assert.ok(!results[0].failedYears.has(100));
    // 100 in savings fails at both spending levels; 1500 works at one.
    assert.ok(results[1].failedYears.has(100));
    assert.ok(!results[1].failedYears.has(1500));
});
