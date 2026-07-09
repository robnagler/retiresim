import { Bookkeeper } from './Bookkeeper.js';
import { Simulator } from './Simulator.js';
import { TaxableAccount } from './TaxableAccount.js';
import { TraditionalIra } from './TraditionalIra.js';
import { Mortgage } from './Mortgage.js';
import { LivingExpense } from './LivingExpense.js';
import { Cash } from './Cash.js';
import { Config } from './Config.js';

const classes = { TaxableAccount, TraditionalIra, Mortgage, LivingExpense, Cash };

const config = new Config({
    Simulator: { startYear: 2026, endYear: 2030 },
    Cash: {
        balance: 0,
        withdrawalOrder: [
            { name: 'TaxableAccount', balance: 500000, rate: 0.06, basis: 300000 },
            { name: 'TraditionalIra', balance: 800000, rate: 0.06, withdraw: 40000 },
        ],
        spendingOrder: [
            { name: 'Mortgage', balance: -200000, rate: 0.06, monthlyPayment: 1500 },
            { name: 'LivingExpense', balance: 60000, rate: 0.025 },
        ],
    },
});

const bookkeeper = new Bookkeeper({ config, classes });
const simulator = new Simulator({ bookkeeper, config });

simulator.run();

console.log(bookkeeper.report());
