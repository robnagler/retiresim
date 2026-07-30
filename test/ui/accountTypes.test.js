import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACCOUNT_COMMON_FIELDS, ACCOUNT_TYPES, defaultAccountName } from '../../src/ui/accountTypes.js';
import { buildConfigData } from '../../src/biz/buildConfig.js';

const MINIMAL_INPUT = {
    birthYear: 1960,
    lifeExpectancy: 90,
    retirementYear: 2027,
    monthlySpending: 5000,
    inflation: 0.025,
    interestRate: 0.03,
    investmentReturn: 0.06,
};

test('every account type has a label and help, since both are shown for every type the form offers', () => {
    for (const [type, spec] of Object.entries(ACCOUNT_TYPES)) {
        assert.ok(spec.label, `${type} label`);
        assert.ok(spec.help, `${type} help`);
    }
});

test('every field of every type has a label, a kind and help, so the dialog can render it and explain it', () => {
    const fields = [...ACCOUNT_COMMON_FIELDS, ...Object.values(ACCOUNT_TYPES).flatMap((spec) => spec.fields)];

    for (const field of fields) {
        assert.ok(field.key, 'key');
        assert.ok(field.label, `${field.key} label`);
        assert.ok(field.kind, `${field.key} kind`);
        assert.ok(field.help, `${field.key} help`);
    }
});

// The two tables are edited separately and would otherwise drift apart --
// a type the form can add but buildConfigData cannot build produces a
// simulation missing an account the user entered.
test('every type the form offers is one buildConfigData can actually build', () => {
    for (const type of Object.keys(ACCOUNT_TYPES)) {
        const data = buildConfigData({
            ...MINIMAL_INPUT,
            accounts: [{ type, name: 'Test', balance: 1000, inheritedYear: 2015, rate: 0.05, endYear: 2045 }],
        });
        const entry = [...data.Cash.withdrawalOrder, ...data.Cash.spendingOrder].find((e) => e.name === 'Test');
        assert.ok(entry, `${type} builds an entry`);
        assert.equal(entry.class, type);
    }
});

test('defaultAccountName uses the plain label when it is free', () => {
    assert.equal(defaultAccountName('RothIra', []), 'Roth IRA');
});

test('defaultAccountName numbers from two, and keeps counting past a gap, so it never collides', () => {
    assert.equal(defaultAccountName('RothIra', ['Roth IRA']), 'Roth IRA 2');
    assert.equal(defaultAccountName('RothIra', ['Roth IRA', 'Roth IRA 2']), 'Roth IRA 3');
    assert.equal(defaultAccountName('RothIra', ['Roth IRA', 'Roth IRA 3']), 'Roth IRA 2');
});

test('defaultAccountName ignores names belonging to other types', () => {
    assert.equal(defaultAccountName('RothIra', ['Taxable account', 'HSA']), 'Roth IRA');
});
