import { Bookkeeper } from './Bookkeeper.js';
import { Simulator } from './Simulator.js';
import { TaxableAccount } from './TaxableAccount.js';
import { TraditionalIra } from './TraditionalIra.js';
import { RothIra } from './RothIra.js';
import { Mortgage } from './Mortgage.js';
import { LivingExpense } from './LivingExpense.js';
import { TaxCalculator } from './TaxCalculator.js';
import { Salary } from './Salary.js';
import { SocialSecurity } from './SocialSecurity.js';
import { Pension } from './Pension.js';
import { Cash } from './Cash.js';
import { Config } from './Config.js';

const classes = {
    TaxableAccount,
    TraditionalIra,
    RothIra,
    Mortgage,
    LivingExpense,
    TaxCalculator,
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
                stateRate: 0.044,
            },
        ],
    },
});

const bookkeeper = new Bookkeeper({ config, classes });
const simulator = new Simulator({ bookkeeper, config });

simulator.run();

console.log(bookkeeper.report());
