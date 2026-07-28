import { Config } from '../../src/Config.js';

// Flat, single-call fixture builder for the Economy + Cash blocks
// copy-pasted in nearly every test that constructs a real Config. Pass
// only what a given test actually varies -- everything else defaults to
// an inert zero/empty value. Extra keys (e.g. Simulator) pass through
// onto the top-level config data unchanged.
//
// testConfigData() returns the plain data object -- needed by tests that
// structuredClone() a base fixture per candidate (e.g. Optimizer.test.js),
// since structuredClone can't safely clone a Config class instance.
// testConfig() is the common case, wrapping that data in `new Config()`.
export function testConfigData({
    inflationRate = 0,
    interestRate = 0,
    sp500Rate = 0,
    balance = 0,
    withdrawalOrder = [],
    incomeOrder = [],
    spendingOrder = [],
    ordinaryIncomeCeiling,
    ...rest
} = {}) {
    const cash = { balance, withdrawalOrder, incomeOrder, spendingOrder };
    if (ordinaryIncomeCeiling !== undefined) {
        cash.ordinaryIncomeCeiling = ordinaryIncomeCeiling;
    }
    return {
        Economy: { inflationRate, interestRate, sp500Rate },
        Cash: cash,
        ...rest,
    };
}

export function testConfig(overrides = {}) {
    return new Config(testConfigData(overrides));
}

// The standard TaxCalculator spendingOrder entry, overridable for the
// handful of tests that need a different balance/bracket/threshold.
export function taxSpender(overrides = {}) {
    return {
        name: 'Tax',
        class: 'TaxCalculator',
        balance: 0,
        federalBrackets: [{ rate: 0.10, upTo: null }],
        ltcgBrackets: [{ rate: 0.15, upTo: null }],
        stateRate: 0.044,
        standardDeduction: 0,
        initialMagi: 0,
        ...overrides,
    };
}
