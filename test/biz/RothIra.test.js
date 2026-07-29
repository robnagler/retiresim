import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RothIra } from '../../src/biz/RothIra.js';
import { Bookkeeper } from '../../src/biz/Bookkeeper.js';
import { Cash } from '../../src/biz/Cash.js';
import { testConfig } from '../support/testConfig.js';

test('earn withdrawal is not taxable -- does not post to OrdinaryIncome, and lands in Cash', () => {
    const config = testConfig({ withdrawalOrder: [{ name: 'RothIra', balance: 1000, withdraw: 300 }] });
    const bookkeeper = new Bookkeeper({ config, classes: { RothIra, Cash } });

    bookkeeper.runYear(2026);

    assert.equal(bookkeeper.balanceChange('OrdinaryIncome', 2026), 0);
    assert.equal(bookkeeper.balanceChange('RothIra', 2026), -300);
    assert.equal(bookkeeper.balanceChange('Cash', 2026), 300);
});
