import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLASSES } from '../../src/biz/classes.js';
import { INPUT_VERSION, buildConfigData } from '../../src/biz/buildConfig.js';
import { YearTable } from '../../src/cli/YearTable.js';

const YEAR = new Date().getFullYear();

function input(overrides = {}) {
    return {
        accounts: [{ balance: 500000, basis: 500000, name: 'Taxable', type: 'TaxableAccount' }],
        birthYear: YEAR - 50,
        inflation: 0,
        interestRate: 0,
        investmentReturn: 0,
        lifeExpectancy: 55,
        lumpSums: [{ amount: 5000, year: YEAR }],
        medicarePartG: 0,
        monthlySalary: 1000,
        monthlySpending: 500,
        retirementYear: YEAR + 2,
        socialSecurityAt67: 0,
        version: INPUT_VERSION,
        ...overrides,
    };
}

test('run reports one row per year with each flow in its own column', () => {
    const table = new YearTable();

    const { failedYear, rows } = table.run(buildConfigData(input()), CLASSES);

    assert.equal(failedYear, null);
    assert.equal(rows.length, 6);
    assert.equal(rows[0].year, YEAR);
    assert.equal(rows[0].earned, 12000);
    assert.equal(rows[0].living, 6000);
    assert.equal(rows[0].lump, 5000);
    assert.equal(rows[1].lump, 0);
    assert.equal(rows[3].earned, 0);
});

test('a withdrawal lands under the column for the kind of account it came from', () => {
    const table = new YearTable();

    const { rows } = table.run(buildConfigData(input()), CLASSES);

    assert.equal(rows[3].taxable, 6000);
    assert.equal(rows[3].traditional, 0);
});

test('total is the sum of the spending columns', () => {
    const table = new YearTable();

    const { rows } = table.run(buildConfigData(input()), CLASSES);

    for (const r of rows) {
        assert.equal(r.total, r.living + r.lump + r.mortgage + r.medicare + r.tax);
    }
    assert.equal(rows[0].total, 11000);
});

test('a mortgage payment is spending, not a source', () => {
    const table = new YearTable();
    const accounts = [
        { balance: 500000, basis: 500000, name: 'Taxable', type: 'TaxableAccount' },
        { balance: 100000, endYear: YEAR + 20, name: 'Mortgage', rate: 0.05, type: 'Mortgage' },
    ];

    const { rows } = table.run(buildConfigData(input({ accounts })), CLASSES);

    assert.ok(rows[0].mortgage > 0);
    assert.equal(rows[0].total, rows[0].living + rows[0].lump + rows[0].mortgage + rows[0].medicare + rows[0].tax);
});

test('a plan that runs out of money keeps the rows before the failure and says when', () => {
    const table = new YearTable();
    const accounts = [{ balance: 20000, basis: 20000, name: 'Taxable', type: 'TaxableAccount' }];

    const result = table.run(buildConfigData(input({ accounts, monthlySpending: 1500 })), CLASSES);
    const out = table.report(result);

    assert.ok(result.failedYear > YEAR);
    assert.equal(result.rows.length, result.failedYear - YEAR);
    assert.match(out, new RegExp(`Stopped: out of money in ${result.failedYear}\\.`));
});

test('lines rounds to thousands and labels every column', () => {
    const table = new YearTable();
    const row = { earned: 12000, hsa: 0, inherited: 0, living: 6499, lump: 0, medicare: 0, mortgage: 0, netWorth: 1234567, roth: 0, tax: 0, taxable: 0, total: 6499, traditional: 0, year: 2030 };

    const out = table.lines({ failedYear: null, rows: [row] });

    assert.match(out[1], /^year  Earned  Inher  HSA  Roth  Trad  Taxbl  Living  Lump  Mortg  Medic  TaxPd  Total  NetWorth$/);
    assert.match(out[2], /^2030      12/);
    assert.match(out[2], /1235$/);
    assert.equal(out.length, 3);
});
