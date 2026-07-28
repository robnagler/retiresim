import { readFileSync } from 'node:fs';
import { Bookkeeper } from './Bookkeeper.js';
import { Simulator } from './Simulator.js';
import { TaxableAccount } from './TaxableAccount.js';
import { TraditionalIra } from './TraditionalIra.js';
import { NonSpousalInheritedIra } from './NonSpousalInheritedIra.js';
import { RothIra } from './RothIra.js';
import { HsaAccount } from './HsaAccount.js';
import { Mortgage } from './Mortgage.js';
import { LivingExpense } from './LivingExpense.js';
import { LumpSum } from './LumpSum.js';
import { TaxCalculator } from './TaxCalculator.js';
import { Medicare } from './Medicare.js';
import { Salary } from './Salary.js';
import { SocialSecurity } from './SocialSecurity.js';
import { Pension } from './Pension.js';
import { Cash } from './Cash.js';
import { Config } from './Config.js';
import { Optimizer, OPTIMIZE_VARIABLES } from './Optimizer.js';

const classes = {
    TaxableAccount,
    TraditionalIra,
    NonSpousalInheritedIra,
    RothIra,
    HsaAccount,
    Mortgage,
    LivingExpense,
    LumpSum,
    TaxCalculator,
    Medicare,
    Salary,
    SocialSecurity,
    Pension,
    Cash,
};

// node src/main.js [path/to/config.json] -- with no argument, runs the
// illustrative example scenario below.
const DEFAULT_CONFIG_DATA = {
    Simulator: { startYear: 2026, endYear: 2030 },
    // Shared market/inflation assumptions -- consumed via bookkeeper.economy
    // instead of each account/income/expense source carrying its own rate.
    Economy: { inflationRate: 0.025, interestRate: 0.03, sp500Rate: 0.06 },
    Cash: {
        balance: 0,
        withdrawalOrder: [
            { name: 'TaxableAccount', balance: 500000, basis: 300000 },
            { name: 'TraditionalIra', balance: 800000, birthYear: 1955 },
            { name: 'RothIra', balance: 200000, withdraw: 0 },
            { name: 'NonSpousalInheritedIra', balance: 100000, inheritedYear: 2009, birthYear: 1955 },
            { name: 'HsaAccount', balance: 40000, zeroBalanceYear: 2035 },
        ],
        incomeOrder: [
            { name: 'Salary', balance: 0, monthlyAmount: 12500, endYear: 2035 },
            { name: 'SocialSecurity', balance: 0, birthYear: 1955, claimAge: 67, fraMonthlyBenefit: 2500 },
            { name: 'Pension', balance: 0, amount: 20000 },
        ],
        spendingOrder: [
            { name: 'Mortgage', balance: -200000, rate: 0.06, endYear: 2045 },
            { name: 'LivingExpense', balance: 60000 },
            {
                name: 'Tax',
                class: 'TaxCalculator',
                balance: 0,
                federalBrackets: [
                    { rate: 0.10, upTo: 11925 },
                    { rate: 0.12, upTo: 48475 },
                    { rate: 0.22, upTo: 103350 },
                    { rate: 0.24, upTo: 197300 },
                    { rate: 0.32, upTo: 250525 },
                    { rate: 0.35, upTo: 626350 },
                    { rate: 0.37, upTo: null },
                ],
                ltcgBrackets: [
                    { rate: 0.00, upTo: 49000 },
                    { rate: 0.15, upTo: 545000 },
                    { rate: 0.20, upTo: null },
                ],
                stateRate: 0.044,
                standardDeduction: 29200,
                ssProvisionalIncomeThresholds: { low: 32000, high: 44000 },
                initialMagi: 200000,
            },
            {
                name: 'Medicare',
                balance: 0,
                // partBMonthly/partDMonthly/partGMonthly are all monthly,
                // unlike everything else in cfg -- Part B is billed monthly by
                // CMS, Part D/Medigap Plan G monthly by private insurers.
                partBMonthly: 175,
                partDMonthly: 50,
                partGMonthly: 150,
            },
        ],
    },
};

// --debug bypasses the optimizer entirely and runs the input cfg values
// exactly as given -- no candidate substitution -- printing the full
// per-year report. Non-debug mode always runs Optimizer.runAll() instead.
function runDebug(configData, classes) {
    const config = new Config(structuredClone(configData));
    const bookkeeper = new Bookkeeper({ config, classes });
    new Simulator({ bookkeeper, config }).run((year) => {
        console.log(bookkeeper.reportYear(year));
        console.log('');
    });
}

const args = process.argv.slice(2);
const debug = args.includes('--debug');
const configPath = args.find((a) => a !== '--debug');
const configData = configPath ? JSON.parse(readFileSync(configPath, 'utf8')) : DEFAULT_CONFIG_DATA;

if (debug) {
    runDebug(configData, classes);
} else {
    new Optimizer().runAll(configData, classes, OPTIMIZE_VARIABLES);
}
