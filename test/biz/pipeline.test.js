import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPipeline, candidateConfigData } from '../../src/biz/pipeline.js';
import { TaxableAccount } from '../../src/biz/TaxableAccount.js';
import { LivingExpense } from '../../src/biz/LivingExpense.js';
import { Cash } from '../../src/biz/Cash.js';
import { testConfigData } from '../support/testConfig.js';

const CLASSES = { TaxableAccount, LivingExpense, Cash };

function configData() {
    return testConfigData({
        Simulator: { startYear: 2026, endYear: 2027 },
        withdrawalOrder: [{ name: 'TaxableAccount', balance: 1000, basis: 1000 }],
        spendingOrder: [{ name: 'LivingExpense', balance: 100 }],
    });
}

test('buildPipeline returns a config and a bookkeeper built from it, with every configured account present', () => {
    const { config, bookkeeper } = buildPipeline(configData(), CLASSES);

    assert.equal(config.get('Simulator').startYear, 2026);
    assert.ok(bookkeeper.accounts.find((a) => a instanceof TaxableAccount));
    assert.ok(bookkeeper.accounts.find((a) => a instanceof Cash));
});

// The optimizer builds one of these per candidate from a single shared
// base config, and Bookkeeper writes each entry back through config.set()
// as it goes -- so a pipeline that held the caller's object would let one
// candidate's construction leak into the next one's.
test('buildPipeline clones, so two pipelines from one config data do not share state', () => {
    const data = configData();

    const first = buildPipeline(data, CLASSES);
    const second = buildPipeline(data, CLASSES);
    first.bookkeeper.accounts[0].deposit(500);

    assert.equal(second.bookkeeper.accounts[0].balance, 1000);
    assert.equal(data.Cash.withdrawalOrder[0].balance, 1000);
});

test('candidateConfigData applies the candidate to a copy, leaving the original untouched', () => {
    const data = configData();
    const variable = { apply: (d, candidate) => { d.Cash.categoryOrder = candidate; } };

    const applied = candidateConfigData(data, variable, ['taxFree', 'ltcg', 'income']);

    assert.deepEqual(applied.Cash.categoryOrder, ['taxFree', 'ltcg', 'income']);
    assert.equal(data.Cash.categoryOrder, undefined);
});
