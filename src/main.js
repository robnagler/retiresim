import { Bookkeeper } from './Bookkeeper.js';
import { Simulator } from './Simulator.js';
import { TaxableAccount } from './TaxableAccount.js';
import { TraditionalIra } from './TraditionalIra.js';
import { NonSpousalInheritedIra } from './NonSpousalInheritedIra.js';
import { RothIra } from './RothIra.js';
import { HsaAccount } from './HsaAccount.js';
import { Mortgage } from './Mortgage.js';
import { LivingExpense } from './LivingExpense.js';
import { TaxCalculator } from './TaxCalculator.js';
import { Medicare } from './Medicare.js';
import { Salary } from './Salary.js';
import { SocialSecurity } from './SocialSecurity.js';
import { Pension } from './Pension.js';
import { Cash } from './Cash.js';
import { Config } from './Config.js';

const classes = {
    TaxableAccount,
    TraditionalIra,
    NonSpousalInheritedIra,
    RothIra,
    HsaAccount,
    Mortgage,
    LivingExpense,
    TaxCalculator,
    Medicare,
    Salary,
    SocialSecurity,
    Pension,
    Cash,
};

const config = new Config({
    Simulator: { startYear: 2026, endYear: 2030 },
    Cash: {
        balance: 0,
        withdrawalOrder: [
            { name: 'TaxableAccount', balance: 500000, rate: 0.06, basis: 300000 },
            { name: 'TraditionalIra', balance: 800000, rate: 0.06, birthYear: 1955 },
            { name: 'RothIra', balance: 200000, rate: 0.06, withdraw: 0 },
            { name: 'NonSpousalInheritedIra', balance: 100000, rate: 0.06, inheritedYear: 2009, birthYear: 1955 },
            { name: 'HsaAccount', balance: 40000, rate: 0.06, withdraw: 0 },
        ],
        incomeOrder: [
            { name: 'Salary', balance: 0, rate: 0, amount: 150000 },
            { name: 'SocialSecurity', balance: 0, rate: 0, amount: 30000 },
            { name: 'Pension', balance: 0, rate: 0, amount: 20000 },
        ],
        spendingOrder: [
            { name: 'Mortgage', balance: -200000, rate: 0.06, monthlyPayment: 1500 },
            { name: 'LivingExpense', balance: 60000, rate: 0.025 },
            {
                name: 'Tax',
                class: 'TaxCalculator',
                balance: 0,
                federalBrackets: [
                    { rate: 0.10, upTo: 10000 },
                    { rate: 0.12, upTo: 40000 },
                    { rate: 0.22, upTo: null },
                ],
                ltcgBrackets: [
                    { rate: 0.00, upTo: 47000 },
                    { rate: 0.15, upTo: 519000 },
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
                rate: 0.05,
                partBBase: 2100,
                partDBase: 600,
                // Illustrative IRMAA tiers (single filer, rounded) -- real
                // thresholds/surcharges belong in the gitignored
                // static/json config, not this example script.
                irmaaBrackets: [
                    { upTo: 106000, partB: 0, partD: 0 },
                    { upTo: 133000, partB: 900, partD: 170 },
                    { upTo: 167000, partB: 2250, partD: 430 },
                    { upTo: 200000, partB: 3600, partD: 690 },
                    { upTo: 500000, partB: 4950, partD: 950 },
                    { upTo: null, partB: 5400, partD: 1050 },
                ],
            },
        ],
    },
});

const bookkeeper = new Bookkeeper({ config, classes });
const simulator = new Simulator({ bookkeeper, config });

simulator.run();

console.log(bookkeeper.report());
