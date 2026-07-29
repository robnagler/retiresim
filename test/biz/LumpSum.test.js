import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LumpSum } from '../../src/biz/LumpSum.js';
import { Bookkeeper } from '../../src/biz/Bookkeeper.js';
import { Cash } from '../../src/biz/Cash.js';
import { testConfig } from '../support/testConfig.js';

const buildConfig = (amounts) => testConfig({
    balance: 500000,
    spendingOrder: [{ name: 'LumpSum', balance: 0, amounts }],
});

test('due posts the configured amount in a listed year', () => {
    const bookkeeper = new Bookkeeper({ config: buildConfig({ 2030: 100000 }), classes: { LumpSum, Cash } });

    bookkeeper.runYear(2030);

    assert.equal(bookkeeper.balanceChange('LumpSumPaid', 2030), 100000);
    assert.equal(bookkeeper.balanceChange('Cash', 2030), -100000);
});

test('due posts nothing in a year not listed in cfg.amounts', () => {
    const bookkeeper = new Bookkeeper({ config: buildConfig({ 2030: 100000 }), classes: { LumpSum, Cash } });

    bookkeeper.runYear(2029);

    assert.equal(bookkeeper.balanceChange('LumpSumPaid', 2029), 0);
    assert.equal(bookkeeper.balanceChange('Cash', 2029), 0);
});

test('multiple configured years each fire independently', () => {
    const bookkeeper = new Bookkeeper({ config: buildConfig({ 2028: 25000, 2030: 100000 }), classes: { LumpSum, Cash } });

    bookkeeper.runYear(2028);
    bookkeeper.runYear(2029);
    bookkeeper.runYear(2030);

    assert.equal(bookkeeper.balanceChange('LumpSumPaid', 2028), 25000);
    assert.equal(bookkeeper.balanceChange('LumpSumPaid', 2029), 0);
    assert.equal(bookkeeper.balanceChange('LumpSumPaid', 2030), 100000);
});
