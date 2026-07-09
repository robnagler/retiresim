import { Bookkeeper } from './Bookkeeper.js';
import { Simulator } from './Simulator.js';
import { TaxableAccount } from './TaxableAccount.js';
import { TraditionalIra } from './TraditionalIra.js';
import { Mortgage } from './Mortgage.js';
import { LivingExpense } from './LivingExpense.js';
import { Config } from './Config.js';

const classes = { TaxableAccount, TraditionalIra, Mortgage, LivingExpense };

const config = new Config({
    Simulator: { startYear: 2026, endYear: 2030 },
    Bookkeeper: { accountClasses: ['Taxable', 'TradIra', 'Mortgage', 'LivingExpense'] },
    Taxable: { class: 'TaxableAccount', balance: 500000, rate: 0.06, priority: 0, basis: 300000 },
    TradIra: { class: 'TraditionalIra', balance: 800000, rate: 0.06, priority: 1, withdraw: 40000 },
    Mortgage: { balance: 200000, rate: 0.06, priority: 2, monthlyPayment: 1500 },
    LivingExpense: { balance: 60000, rate: 0.025, priority: 3 },
});

const bookkeeper = new Bookkeeper({ config, classes });
const simulator = new Simulator({ bookkeeper, config });

simulator.run();

console.log(bookkeeper.report());
