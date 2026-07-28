import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Economy } from '../src/Economy.js';
import { Config } from '../src/Config.js';

test('reads all four rates from cfg.Economy', () => {
    const config = new Config({
        Economy: { inflationRate: 0.025, colaRate: 0.03, interestRate: 0.02, sp500Rate: 0.07 },
    });

    const economy = new Economy({ config });

    assert.equal(economy.inflationRate, 0.025);
    assert.equal(economy.colaRate, 0.03);
    assert.equal(economy.interestRate, 0.02);
    assert.equal(economy.sp500Rate, 0.07);
});
