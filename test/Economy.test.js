import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Economy } from '../src/Economy.js';
import { Config } from '../src/Config.js';

test('reads inflationRate/interestRate/sp500Rate from cfg.Economy', () => {
    const config = new Config({
        Economy: { inflationRate: 0.025, interestRate: 0.02, sp500Rate: 0.07 },
    });

    const economy = new Economy({ config });

    assert.equal(economy.inflationRate, 0.025);
    assert.equal(economy.interestRate, 0.02);
    assert.equal(economy.sp500Rate, 0.07);
});

test('colaRate is not configured separately -- it is derived from inflationRate', () => {
    const config = new Config({
        Economy: { inflationRate: 0.031, interestRate: 0, sp500Rate: 0 },
    });

    const economy = new Economy({ config });

    assert.equal(economy.colaRate, 0.031);
});
