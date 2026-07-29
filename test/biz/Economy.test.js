import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Economy } from '../../src/biz/Economy.js';
import { Config } from '../../src/biz/Config.js';

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

test('sp500Rate is unaffected by currentYear/historicalReturns being unset -- every non-robustness run behaves exactly as before', () => {
    const config = new Config({ Economy: { inflationRate: 0, interestRate: 0, sp500Rate: 0.07 } });
    const economy = new Economy({ config });

    economy.currentYear = 2030;

    assert.equal(economy.sp500Rate, 0.07);
});

test('sp500Rate returns the sampled historical return for the current year when a sequence is set and this year is in it', () => {
    const config = new Config({ Economy: { inflationRate: 0, interestRate: 0, sp500Rate: 0.07 } });
    const economy = new Economy({ config });
    economy.setHistoricalReturns(new Map([[2030, { sp500Rate: -0.37, inflationRate: 0.038 }]]));

    economy.currentYear = 2030;
    assert.equal(economy.sp500Rate, -0.37);

    economy.currentYear = 2031;
    assert.equal(economy.sp500Rate, 0.07);
});

test('inflationRate and colaRate return the sampled historical year\'s paired inflation figure, not an independent draw', () => {
    const config = new Config({ Economy: { inflationRate: 0.025, interestRate: 0, sp500Rate: 0.07 } });
    const economy = new Economy({ config });
    economy.setHistoricalReturns(new Map([[2030, { sp500Rate: -0.37, inflationRate: 0.11 }]]));

    economy.currentYear = 2030;
    assert.equal(economy.inflationRate, 0.11);
    assert.equal(economy.colaRate, 0.11);

    economy.currentYear = 2031;
    assert.equal(economy.inflationRate, 0.025);
    assert.equal(economy.colaRate, 0.025);
});

test('baseSp500Rate always returns the configured rate, ignoring any active historical-return sequence', () => {
    const config = new Config({ Economy: { inflationRate: 0, interestRate: 0, sp500Rate: 0.07 } });
    const economy = new Economy({ config });
    economy.setHistoricalReturns(new Map([[2030, { sp500Rate: -0.37, inflationRate: 0.038 }]]));
    economy.currentYear = 2030;

    assert.equal(economy.sp500Rate, -0.37);
    assert.equal(economy.baseSp500Rate, 0.07);
});
