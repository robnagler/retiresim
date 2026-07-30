import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OptimizerReport } from '../../src/cli/OptimizerReport.js';

test('formatScore reports the raw score normally, and "0 (YYYY)" for a candidate that ran out of money', () => {
    const report = new OptimizerReport();
    const failedYears = new Map([[2, 2031]]);

    assert.equal(report.formatScore(1, 12345.6, failedYears), '12346');
    assert.equal(report.formatScore(2, 0, failedYears), '0 (2031)');
});

test('netWorthTableLines collapses to one line when every candidate ran out of money', () => {
    const report = new OptimizerReport();
    const netWorth = { best: 1, score: 0, all: [{ candidate: 1, score: 0 }, { candidate: 2, score: 0 }] };
    const failedYears = new Map([[1, 2040], [2, 2041]]);

    const out = report.netWorthTableLines('X', netWorth, failedYears).join('\n');

    assert.match(out, /every candidate ran out of money/);
    assert.match(out, /0 \(2040\)/);
    assert.match(out, /0 \(2041\)/);
});

test('netWorthTableLines collapses to one line when only one legal candidate exists', () => {
    const report = new OptimizerReport();
    const netWorth = { best: 5, score: 1000, all: [{ candidate: 5, score: 1000 }] };

    const out = report.netWorthTableLines('X', netWorth, new Map()).join('\n');

    assert.match(out, /only one legal candidate \(5\), net worth 1000/);
});

test('netWorthTableLines collapses to one line when every candidate ties', () => {
    const report = new OptimizerReport();
    const netWorth = { best: 1, score: 500, all: [{ candidate: 1, score: 500 }, { candidate: 2, score: 500 }] };

    const out = report.netWorthTableLines('X', netWorth, new Map()).join('\n');

    assert.match(out, /no effect on net worth \(all 2 candidates tie at 500\)/);
});

test('netWorthTableLines prints a full candidate table with the winner marked', () => {
    const report = new OptimizerReport();
    const netWorth = { best: 2, score: 900, all: [{ candidate: 1, score: 500 }, { candidate: 2, score: 900 }] };

    const out = report.netWorthTableLines('X', netWorth, new Map()).join('\n');

    assert.match(out, /Candidate/);
    assert.match(out, /2.*900.*<- best/);
});

// A candidate with a `columns` object (e.g. Optimizer.js's
// categoryOrderCandidate) gets a real multi-column table instead of one
// long single-column string -- this is what makes a 54-row grid like
// "Withdrawal category order + ceilings" actually readable.
test('netWorthTableLines prints one column per candidate.columns key, plus Net Worth, left-justifying only the first (label) column', () => {
    const report = new OptimizerReport();
    const candidate = (order, cap) => ({ columns: { Order: order, 'ltcg cap': cap } });
    const netWorth = {
        best: undefined,
        score: 900,
        all: [
            { candidate: candidate('Trad > Tax', 'none'), score: 500 },
            { candidate: candidate('Tax > Trad', '47,000'), score: 900 },
        ],
    };
    netWorth.best = netWorth.all[1].candidate;

    const lines = report.netWorthTableLines('X', netWorth, new Map()).join('\n').split('\n').filter(Boolean);

    assert.equal(lines[0], 'X');
    // The label column (Order) is left-justified -- "Trad > Tax" and
    // "Tax > Trad" are the same length, so this alone wouldn't prove it,
    // but the header lining up under both rows confirms consistent
    // column widths regardless of justification direction.
    assert.match(lines[1], /^  Order\s+ltcg cap\s+Net Worth$/);
    // The ltcg cap column is right-justified: "none" (4 chars) gets
    // leading padding to match "47,000" (6 chars) -- a trailing-padded
    // (left-justified) "none" would leave the header's "ltcg cap" text
    // starting to the right of where "none" starts, not directly above it.
    const capColumnStart = lines[1].indexOf('ltcg cap');
    assert.equal(lines[2].indexOf('none'), capColumnStart + 'ltcg cap'.length - 'none'.length);
    assert.match(lines[2], /Trad > Tax\s+none\s+500/);
    assert.match(lines[3], /Tax > Trad\s+47,000\s+900\s+<- best/);
});

// report() is what main.js actually calls -- proves the net-worth table
// and the winning candidate's ending balances combine the same way the
// pre-refactor console.log calls used to (net-worth table, then a header
// line, then the balances), across more than one variable.
test('report joins each variable\'s net-worth table with its ending balances, skipping balances for a variable whose winner ran out of money', () => {
    const report = new OptimizerReport();
    const results = [
        {
            label: 'A',
            netWorth: { best: 2, score: 900, all: [{ candidate: 1, score: 500 }, { candidate: 2, score: 900 }] },
            failedYears: new Map(),
            endingBalances: 'Account  Balance\nTaxableAccount  900',
        },
        {
            label: 'B',
            netWorth: { best: 1, score: 0, all: [{ candidate: 1, score: 0 }] },
            failedYears: new Map([[1, 2040]]),
            endingBalances: null,
        },
    ];

    const out = report.report(results);

    assert.match(out, /A\n/);
    assert.match(out, /Ending balances \(best candidate\):\nAccount  Balance\nTaxableAccount  900/);
    assert.match(out, /B -- every candidate ran out of money:/);
    assert.match(out, /0 \(2040\)/);
    // B's winner failed -- no "Ending balances" section for it.
    assert.equal(out.split('Ending balances').length, 2);
});
