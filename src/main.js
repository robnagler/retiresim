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
import { TaxCalculator } from './TaxCalculator.js';
import { Medicare } from './Medicare.js';
import { Salary } from './Salary.js';
import { SocialSecurity, claimAgeCandidates } from './SocialSecurity.js';
import { Pension } from './Pension.js';
import { Cash } from './Cash.js';
import { Config } from './Config.js';
import { Optimizer } from './Optimizer.js';

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

// node src/main.js [path/to/config.json] -- with no argument, runs the
// illustrative example scenario below.
const DEFAULT_CONFIG_DATA = {
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
            { name: 'Salary', balance: 0, rate: 0, monthlyAmount: 12500, endYear: 2035 },
            { name: 'SocialSecurity', balance: 0, rate: 0, birthYear: 1955, claimAge: 67, fraMonthlyBenefit: 2500 },
            { name: 'Pension', balance: 0, rate: 0, amount: 20000 },
        ],
        spendingOrder: [
            { name: 'Mortgage', balance: -200000, rate: 0.06, endYear: 2045 },
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

// CLAUDE.md's "Optimize Variables": one entry per implemented variable.
// candidates() lists the values to try; apply() overrides a cloned
// config's field for one candidate. Optimizer.js itself needs no
// knowledge of any of this -- it just sees candidates + a scoring closure.
const OPTIMIZE_VARIABLES = [
    {
        label: 'SS claim age',
        // Excludes claim ages already passed as of Simulator.startYear --
        // not real, actionable choices for someone already older than them.
        candidates: (configData) => {
            const { birthYear } = configData.Cash.incomeOrder.find((e) => e.name === 'SocialSecurity');
            return claimAgeCandidates({ birthYear, asOfYear: configData.Simulator.startYear });
        },
        apply: (data, candidate) => {
            data.Cash.incomeOrder.find((e) => e.name === 'SocialSecurity').claimAge = candidate;
        },
    },
    {
        label: 'Withdrawal ordinary-income ceiling',
        // Candidates are the federal bracket boundaries themselves (plus
        // "no cap") -- the interesting choices are "fill up to the top of
        // this bracket," not arbitrary dollar amounts in between.
        candidates: (configData) => {
            const tax = configData.Cash.spendingOrder.find((e) => e.class === 'TaxCalculator');
            const bounds = tax.federalBrackets.map((b) => b.upTo).filter((upTo) => upTo !== null);
            return [...bounds, Infinity];
        },
        apply: (data, candidate) => {
            data.Cash.ordinaryIncomeCeiling = candidate;
        },
    },
];

// Builds one candidate's Config/Bookkeeper without running the Simulator,
// so callers can choose whether to run it silently (for scoring) or with
// the per-year report callback (for --debug).
function buildPipeline(configData, variable, candidate) {
    const data = structuredClone(configData);
    variable.apply(data, candidate);
    const config = new Config(data);
    const bookkeeper = new Bookkeeper({ config, classes });
    return { config, bookkeeper };
}

// A full candidate/net-worth table implies a real tradeoff was searched.
// Two cases where that's misleading: only one legal candidate existed
// (e.g. SS claim age when already past 70, see claimAgeCandidates()), or
// every candidate scored the same (e.g. Salary end year when
// monthlyAmount=0, so there's no income to vary at all). Both are
// collapsed to one flagged line instead of a table that looks
// informative but isn't.
function printNetWorthTable(label, rv) {
    if (rv.all.length === 1) {
        console.log(`\n${label} -- only one legal candidate (${rv.best}), net worth ${rv.score.toFixed(0)}`);
        return;
    }
    const scores = rv.all.map((r) => r.score);
    if (Math.max(...scores) - Math.min(...scores) < 0.01) {
        console.log(`\n${label} -- no effect on net worth (all ${rv.all.length} candidates tie at ${rv.score.toFixed(0)})`);
        return;
    }
    console.log(`\n${label}`);
    console.log(`  ${'Candidate'.padStart(9)}   ${'Net Worth'.padStart(12)}`);
    for (const { candidate, score } of rv.all) {
        const marker = candidate === rv.best ? '  <- best' : '';
        console.log(`  ${String(candidate).padStart(9)}   ${score.toFixed(0).padStart(12)}${marker}`);
    }
}

// Runs every OPTIMIZE_VARIABLES entry against configData, printing a
// candidate/net-worth table for each. --debug additionally prints the
// full per-year report (reportYear(), same as the old single-scenario
// mode) for each variable's winning candidate -- omitted by default since
// printing it for every variable would be too much output to scan.
function runOptimize(configData, debug) {
    for (const variable of OPTIMIZE_VARIABLES) {
        const candidates = variable.candidates(configData);
        const evaluate = (candidate) => {
            const { config, bookkeeper } = buildPipeline(configData, variable, candidate);
            new Simulator({ bookkeeper, config }).run();
            return bookkeeper.netWorth();
        };
        const rv = new Optimizer().run(candidates, evaluate);
        printNetWorthTable(variable.label, rv);
        if (debug) {
            const { config, bookkeeper } = buildPipeline(configData, variable, rv.best);
            new Simulator({ bookkeeper, config }).run((year) => {
                console.log(bookkeeper.reportYear(year));
                console.log('');
            });
        }
    }
}

const args = process.argv.slice(2);
const debug = args.includes('--debug');
const configPath = args.find((a) => a !== '--debug');
const configData = configPath ? JSON.parse(readFileSync(configPath, 'utf8')) : DEFAULT_CONFIG_DATA;

runOptimize(configData, debug);
