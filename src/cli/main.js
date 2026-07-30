import { readFileSync } from 'node:fs';
import { Bookkeeper } from '../biz/Bookkeeper.js';
import { Simulator } from '../biz/Simulator.js';
import { TaxableAccount } from '../biz/TaxableAccount.js';
import { TraditionalIra } from '../biz/TraditionalIra.js';
import { NonSpousalInheritedIra } from '../biz/NonSpousalInheritedIra.js';
import { RothIra } from '../biz/RothIra.js';
import { HsaAccount } from '../biz/HsaAccount.js';
import { Mortgage } from '../biz/Mortgage.js';
import { LivingExpense } from '../biz/LivingExpense.js';
import { LumpSum } from '../biz/LumpSum.js';
import { TaxCalculator } from '../biz/TaxCalculator.js';
import { Medicare } from '../biz/Medicare.js';
import { Salary } from '../biz/Salary.js';
import { SocialSecurity } from '../biz/SocialSecurity.js';
import { Pension } from '../biz/Pension.js';
import { Cash } from '../biz/Cash.js';
import { Config } from '../biz/Config.js';
import { Optimizer, OPTIMIZE_VARIABLES } from '../biz/Optimizer.js';
import { RobustnessValidator } from '../biz/RobustnessValidator.js';
import { applyDefaults } from '../biz/buildConfig.js';
import { OptimizerReport } from './OptimizerReport.js';

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

// node src/cli/main.js [path/to/config.json] -- with no argument, runs the
// illustrative example scenario below.
const DEFAULT_CONFIG_DATA = {
    Simulator: { startYear: 2026, endYear: 2030 },
    // Shared market/inflation assumptions -- consumed via bookkeeper.economy
    // instead of each account/income/expense source carrying its own rate.
    Economy: { inflationRate: 0.025, interestRate: 0.03, sp500Rate: 0.06 },
    // --robustness (RobustnessValidator.js) does NOT read a MarketCrash
    // cfg block -- historical S&P 500 return data lives in
    // HistoricalReturns.js as a committed JavaScript constant, not
    // cfg.json, since it's a fact about market history, not a per-user
    // assumption.
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
            // The Tax/TaxCalculator entry itself is deliberately absent
            // here -- applyDefaults() (src/biz/buildConfig.js, run on
            // every configData main.js loads) injects it and fills in its
            // bracket/threshold/initialMagi fields.
            {
                name: 'Medicare',
                balance: 0,
                // Premiums don't start until this birthYear's 65th year.
                birthYear: 1955,
                // partBMonthly/partDMonthly/partGMonthly are all monthly,
                // unlike everything else in cfg -- Part B is billed monthly by
                // CMS, Part D/Medigap Plan G monthly by private insurers.
                partBMonthly: 203,
                partDMonthly: 83,
                partGMonthly: 203,
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

// --robustness [N]: also runs configData exactly as given, like --debug --
// but as many trials (default 200), each with its own random market-crash
// sequence, reporting the resulting insolvency rate and net-worth
// distribution instead of one year-by-year report. A separate step after
// the optimizer, not a replacement for it -- see RobustnessValidator.js.
function runRobustness(configData, classes, trials) {
    const validator = new RobustnessValidator();
    console.log(validator.report(validator.run(configData, classes, trials)));
}

const args = process.argv.slice(2);
const debug = args.includes('--debug');
const robustnessIndex = args.indexOf('--robustness');
const skipIndices = new Set();
if (debug) {
    skipIndices.add(args.indexOf('--debug'));
}
let robustnessTrials;
if (robustnessIndex !== -1) {
    skipIndices.add(robustnessIndex);
    const next = args[robustnessIndex + 1];
    if (next !== undefined && /^\d+$/.test(next)) {
        robustnessTrials = Number(next);
        skipIndices.add(robustnessIndex + 1);
    }
}
const configPath = args.find((a, i) => !skipIndices.has(i));
const rawConfigData = configPath ? JSON.parse(readFileSync(configPath, 'utf8')) : DEFAULT_CONFIG_DATA;
const configData = applyDefaults(rawConfigData);

if (robustnessIndex !== -1) {
    runRobustness(configData, classes, robustnessTrials);
} else if (debug) {
    runDebug(configData, classes);
} else {
    const results = new Optimizer().runAll(configData, classes, OPTIMIZE_VARIABLES);
    console.log(new OptimizerReport().report(results));
}
