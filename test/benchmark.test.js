import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildConfigData, INPUT_VERSION } from '../src/biz/buildConfig.js';
import { Optimizer, OPTIMIZE_VARIABLES } from '../src/biz/Optimizer.js';
import { CLASSES } from '../src/biz/classes.js';

// One scenario carried all the way through the real pipeline -- the form's
// own input shape, through buildConfigData, through the optimizer, to a net
// worth and a chosen strategy. Every other test checks a piece; this checks
// that the pieces still add up to the same answer.
//
// It is a golden test, so it fails whenever the answer moves. That is the
// point: the numbers below are not correct in any absolute sense, they are
// what this code currently produces, and a change to any of it should have
// to be looked at rather than absorbed silently. When it fails, read the
// diff and decide whether the new number is better -- do not just paste it
// in.
//
// Balances are chosen so all three tax categories hold enough to matter,
// the taxable account carries real embedded gain rather than being all
// basis, and the traditional balance is large enough that required
// distributions produce serious ordinary income in the back half. Nothing
// else is configured -- no mortgage, no lump sums, no salary -- so the only
// thing being searched is the withdrawal strategy.
const BENCHMARK_INPUT = {
    version: INPUT_VERSION,
    birthYear: 1960,
    socialSecurityAt67: 3000,
    medicarePartG: 203,
    accounts: [
        { type: 'TraditionalIra', name: 'Traditional IRA', balance: 1000000 },
        { type: 'TaxableAccount', name: 'Taxable account', balance: 1000000, basis: 400000 },
        { type: 'RothIra', name: 'Roth IRA', balance: 500000 },
    ],
    lumpSums: [],
    lifeExpectancy: 90,
    retirementYear: 2026,
    monthlySpending: 9000,
    inflation: 0.025,
    interestRate: 0.03,
    investmentReturn: 0.06,
};

// buildConfigData starts the simulation in whatever year it is run, so the
// horizon would shorten by one every January and every number below with
// it. Pinned here, and only here -- everything else goes through the
// ordinary path.
const START_YEAR = 2026;

// Memoized: the search is 756 simulations, which is a fifth of a second --
// nothing on its own, but three tests asking the same question three times
// is three fifths for one answer. The input is a constant and the pipeline
// has no clock or randomness in it, so the second call cannot differ from
// the first.
let cached = null;

function runBenchmark() {
    if (cached) {
        return cached;
    }
    const configData = buildConfigData(BENCHMARK_INPUT);
    configData.Simulator.startYear = START_YEAR;
    const results = new Optimizer().runAll(configData, CLASSES, OPTIMIZE_VARIABLES);
    const byLabel = (label) => results.find((r) => r.label === label).netWorth.best;
    cached = {
        netWorth: results[results.length - 1].netWorth.score,
        withdrawal: byLabel('Withdrawal category order + ceilings'),
        claimAge: byLabel('Social Security claim age'),
        results,
    };
    return cached;
}

// The headline number, to the dollar. Rounded only because floating point
// makes the last cent meaningless, not to leave slack -- a change of a few
// dollars is still a change worth seeing.
test('benchmark: the whole pipeline produces the same net worth at 90', () => {
    assert.equal(Math.round(runBenchmark().netWorth), 4414853);
});

// The chosen strategy, which is the part that actually changes behaviour --
// a net worth can drift for many reasons, but a different order means the
// optimizer reached a different conclusion about what to do.
//
// This scenario chose income > taxFree > ltcg until #27 was fixed, and
// scored 4,269,124 doing it. The capital-gains ceiling ignored ordinary
// income, so from the year required distributions began the model believed
// the whole 0% bracket was free when in truth none of it was, and drawing
// from the taxable account early meant realizing gains taxed at 15%. With
// the ceiling honest, that order wins instead and keeps 145,729 more --
// most of it tax never paid, the rest what the unpaid tax went on earning.
test('benchmark: the whole pipeline chooses the same strategy', () => {
    const { withdrawal, claimAge } = runBenchmark();

    assert.deepEqual(withdrawal.categoryOrder, ['income', 'ltcg', 'taxFree']);
    assert.equal(withdrawal.ltcgCeilingBracket, 0);
    assert.equal(withdrawal.incomeCeilingBracket, 0);
    assert.equal(claimAge, 69);
});

// Guards the two above from passing for the wrong reason. A scenario that
// ran out of money would score 0 and report null detail, and an assertion
// on a stale number could still be made to fit that.
test('benchmark: the winning plan is solvent for the whole horizon', () => {
    const { results, netWorth } = runBenchmark();
    const plan = results[results.length - 1];

    assert.ok(netWorth > 0);
    assert.ok(plan.netWorthByYear, 'winner did not run out of money');
    assert.equal(plan.netWorthByYear.length, BENCHMARK_INPUT.birthYear + BENCHMARK_INPUT.lifeExpectancy - START_YEAR + 1);
    assert.equal(plan.netWorthByYear[plan.netWorthByYear.length - 1].year, 2050);
});
