import { readFileSync } from 'node:fs';
import { Simulator } from '../biz/Simulator.js';
import { CLASSES } from '../biz/classes.js';
import { Optimizer, OPTIMIZE_VARIABLES } from '../biz/Optimizer.js';
import { RobustnessValidator } from '../biz/RobustnessValidator.js';
import { buildConfigData, INPUT_VERSION } from '../biz/buildConfig.js';
import { buildPipeline } from '../biz/pipeline.js';
import { InsufficientFundsError } from '../biz/InsufficientFundsError.js';
import { OptimizerReport } from './OptimizerReport.js';

// node src/cli/main.js [--debug] [path/to/plan.json]
//
// The file is one the browser's Export button wrote -- the form's own
// fields, not the expanded simulation config -- so a plan can move between
// the two without being retyped. With no argument, the illustrative
// scenario below stands in. Every figure in it is invented.
const DEFAULT_INPUT = {
    version: INPUT_VERSION,
    birthYear: 1955,
    monthlySalary: 12500,
    socialSecurityAt67: 2500,
    medicarePartG: 203,
    accounts: [
        { type: 'TaxableAccount', name: 'Taxable account', balance: 500000, basis: 300000 },
        { type: 'TraditionalIra', name: 'Traditional IRA', balance: 800000 },
        { type: 'RothIra', name: 'Roth IRA', balance: 200000 },
        { type: 'NonSpousalInheritedIra', name: 'Inherited IRA', balance: 100000, inheritedYear: 2022 },
        { type: 'HsaAccount', name: 'HSA', balance: 40000 },
        { type: 'Mortgage', name: 'Mortgage', balance: 200000, rate: 0.06, endYear: 2045 },
    ],
    lumpSums: [],
    lifeExpectancy: 90,
    retirementYear: 2035,
    monthlySpending: 5000,
    inflation: 0.025,
    interestRate: 0.03,
    investmentReturn: 0.06,
};

// The winning plan, year by year. Runs on the configured rates rather than
// a sampled sequence: this is the accounting of one plan, and printing a
// trial's worth of sampled returns would be printing one arbitrary roll of
// the dice next to a robustness summary that already covers all of them.
function reportEachYear(configData) {
    const { config, bookkeeper } = buildPipeline(configData, CLASSES);
    try {
        new Simulator({ bookkeeper, config }).run((year) => {
            console.log(bookkeeper.reportYear(year));
            console.log('');
        });
    } catch (err) {
        if (!(err instanceof InsufficientFundsError)) {
            throw err;
        }
        console.log(`Stopped: out of money in ${err.year}.`);
    }
}

const args = process.argv.slice(2);
const debug = args.includes('--debug');
const inputPath = args.find((a) => a !== '--debug');
const input = inputPath ? JSON.parse(readFileSync(inputPath, 'utf8')) : DEFAULT_INPUT;
// The same refusal src/ui/app.js's importFields() makes, for the same
// reason -- the two read the same files, so a file one of them will not
// touch is not one the other should quietly accept.
if (input.version !== INPUT_VERSION) {
    console.error(`This file was saved by a different version (${input.version ?? 'no version'}, expected ${INPUT_VERSION}) and cannot be read.`);
    process.exit(1);
}

// The same sequence src/ui/app.js runs on Optimize, printed instead of
// drawn: search for the best plan, then stress-test the plan it chose.
// Nothing here decides anything the browser would decide differently --
// that is the point of the CLI and the browser sharing one format.
const configData = buildConfigData(input);
const optimizer = new Optimizer();
const results = optimizer.runAll(configData, CLASSES, OPTIMIZE_VARIABLES);
console.log(new OptimizerReport().report(results));

const winning = optimizer.winningConfigData(configData, results, OPTIMIZE_VARIABLES);
// A plan that already fails on one steady return has nothing to learn from
// two hundred worse ones -- the browser skips the robustness check for the
// same reason.
if (results[results.length - 1].netWorthByYear) {
    const validator = new RobustnessValidator();
    console.log('');
    console.log(validator.report(validator.run(winning, CLASSES)));
}

if (debug) {
    console.log('');
    reportEachYear(winning);
}
