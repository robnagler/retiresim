import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Optimizer } from '../src/Optimizer.js';
import { Config } from '../src/Config.js';
import { Bookkeeper } from '../src/Bookkeeper.js';
import { Simulator } from '../src/Simulator.js';
import { TaxableAccount } from '../src/TaxableAccount.js';
import { TraditionalIra } from '../src/TraditionalIra.js';
import { RothIra } from '../src/RothIra.js';
import { LivingExpense } from '../src/LivingExpense.js';
import { TaxCalculator } from '../src/TaxCalculator.js';
import { Salary } from '../src/Salary.js';
import { SocialSecurity, MIN_CLAIM_AGE, MAX_CLAIM_AGE } from '../src/SocialSecurity.js';
import { Cash } from '../src/Cash.js';
import { testConfigData, taxSpender } from './support/testConfig.js';

// Captures console.log output for the duration of fn, restoring it
// afterward even if fn throws.
function captureLog(fn) {
    const lines = [];
    const original = console.log;
    console.log = (line) => lines.push(line);
    try {
        fn();
    } finally {
        console.log = original;
    }
    return lines.join('\n');
}

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
    const baseData = testConfigData({
        Simulator: { startYear: 2026, endYear: 2030 },
        withdrawalOrder: [{ name: 'TaxableAccount', balance: 100000, basis: 100000 }],
        incomeOrder: [{ name: 'SocialSecurity', balance: 0, birthYear: 1958, claimAge: 0, fraMonthlyBenefit: 2000 }],
        spendingOrder: [{ name: 'LivingExpense', balance: 10000 }],
    });
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
    // pipeline end to end, same as the SS claim age test above does for
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

// Phase 1 (CLAUDE.md TODO): Optimizer now owns the whole candidate-
// evaluation pipeline and its console reporting, not just main.js's free
// functions. formatScore()/printNetWorthTable() moved onto the class --
// these are pure unit tests of that reporting logic, no Simulator involved.
test('formatScore reports the raw score normally, and "0 (YYYY)" for a candidate that ran out of money', () => {
    const optimizer = new Optimizer();
    const failedYears = new Map([[2, 2031]]);

    assert.equal(optimizer.formatScore(1, 12345.6, failedYears), '12346');
    assert.equal(optimizer.formatScore(2, 0, failedYears), '0 (2031)');
});

test('printNetWorthTable collapses to one line when every candidate ran out of money', () => {
    const optimizer = new Optimizer();
    const netWorth = { best: 1, score: 0, all: [{ candidate: 1, score: 0 }, { candidate: 2, score: 0 }] };
    const failedYears = new Map([[1, 2040], [2, 2041]]);

    const out = captureLog(() => optimizer.printNetWorthTable('X', netWorth, failedYears));

    assert.match(out, /every candidate ran out of money/);
    assert.match(out, /0 \(2040\)/);
    assert.match(out, /0 \(2041\)/);
});

test('printNetWorthTable collapses to one line when only one legal candidate exists', () => {
    const optimizer = new Optimizer();
    const netWorth = { best: 5, score: 1000, all: [{ candidate: 5, score: 1000 }] };

    const out = captureLog(() => optimizer.printNetWorthTable('X', netWorth, new Map()));

    assert.match(out, /only one legal candidate \(5\), net worth 1000/);
});

test('printNetWorthTable collapses to one line when every candidate ties', () => {
    const optimizer = new Optimizer();
    const netWorth = { best: 1, score: 500, all: [{ candidate: 1, score: 500 }, { candidate: 2, score: 500 }] };

    const out = captureLog(() => optimizer.printNetWorthTable('X', netWorth, new Map()));

    assert.match(out, /no effect on net worth \(all 2 candidates tie at 500\)/);
});

test('printNetWorthTable prints a full candidate table with the winner marked', () => {
    const optimizer = new Optimizer();
    const netWorth = { best: 2, score: 900, all: [{ candidate: 1, score: 500 }, { candidate: 2, score: 900 }] };

    const out = captureLog(() => optimizer.printNetWorthTable('X', netWorth, new Map()));

    assert.match(out, /Candidate/);
    assert.match(out, /2.*900.*<- best/);
});

// A candidate with a `columns` object (e.g. categoryOrderCandidate) gets
// a real multi-column table instead of one long single-column string --
// this is what makes a 54-row grid like "Withdrawal category order +
// ceilings" actually readable.
test('printNetWorthTable prints one column per candidate.columns key, plus Net Worth, left-justifying only the first (label) column', () => {
    const optimizer = new Optimizer();
    const candidate = (order, cap) => ({ columns: { Order: order, 'Tax cap': cap } });
    const netWorth = {
        best: undefined,
        score: 900,
        all: [
            { candidate: candidate('Trad > Tax', 'none'), score: 500 },
            { candidate: candidate('Tax > Trad', '47,000'), score: 900 },
        ],
    };
    netWorth.best = netWorth.all[1].candidate;

    const out = captureLog(() => optimizer.printNetWorthTable('X', netWorth, new Map()));
    const lines = out.split('\n').filter(Boolean);

    assert.equal(lines[0], 'X');
    // The label column (Order) is left-justified -- "Trad > Tax" and
    // "Tax > Trad" are the same length, so this alone wouldn't prove it,
    // but the header lining up under both rows confirms consistent
    // column widths regardless of justification direction.
    assert.match(lines[1], /^  Order\s+Tax cap\s+Net Worth$/);
    // The Tax cap column is right-justified: "none" (4 chars) gets
    // leading padding to match "47,000" (6 chars) -- a trailing-padded
    // (left-justified) "none" would leave the header's "Tax cap" text
    // starting to the right of where "none" starts, not directly above it.
    const capColumnStart = lines[1].indexOf('Tax cap');
    assert.equal(lines[2].indexOf('none'), capColumnStart + 'Tax cap'.length - 'none'.length);
    assert.match(lines[2], /Trad > Tax\s+none\s+500/);
    assert.match(lines[3], /Tax > Trad\s+47,000\s+900\s+<- best/);
});

// Integration test: runAll() wired to a real Config/Bookkeeper/Simulator,
// proving InsufficientFundsError from one candidate is caught, scored 0,
// displayed as "0 (YYYY)", and doesn't abort the rest of the grid -- the
// same shape as the moved-from-main.js behavior, now exercised directly
// against Optimizer.runAll() instead of a free function.
test('runAll catches InsufficientFundsError per-candidate and keeps the grid running', () => {
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

    const out = captureLog(() => new Optimizer().runAll(baseData, classes, [variable]));

    assert.match(out, /500/);
    assert.match(out, /0 \(2026\)/);
});
