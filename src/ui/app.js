// DOM glue only, no independent logic of its own -- reads the form,
// calls buildConfigData()/Optimizer.runAll()/OptimizerReport.report()/
// renderNetWorthChart(), same "thin dispatcher" precedent as
// src/cli/main.js. No test file, for the same reason main.js has none:
// all the real logic lives in the tested modules this file just calls.
import { buildConfigData } from '../biz/buildConfig.js';
import { Optimizer, OPTIMIZE_VARIABLES } from '../biz/Optimizer.js';
import { TaxableAccount } from '../biz/TaxableAccount.js';
import { TraditionalIra } from '../biz/TraditionalIra.js';
import { NonSpousalInheritedIra } from '../biz/NonSpousalInheritedIra.js';
import { RothIra } from '../biz/RothIra.js';
import { HsaAccount } from '../biz/HsaAccount.js';
import { Mortgage } from '../biz/Mortgage.js';
import { LivingExpense } from '../biz/LivingExpense.js';
import { TaxCalculator } from '../biz/TaxCalculator.js';
import { Medicare } from '../biz/Medicare.js';
import { Salary } from '../biz/Salary.js';
import { SocialSecurity } from '../biz/SocialSecurity.js';
import { Cash } from '../biz/Cash.js';
import { OptimizerReport } from '../cli/OptimizerReport.js';
import { renderNetWorthChart } from './chart.js';

const classes = {
    TaxableAccount, TraditionalIra, NonSpousalInheritedIra, RothIra, HsaAccount,
    Mortgage, LivingExpense, TaxCalculator, Medicare, Salary, SocialSecurity, Cash,
};

// defaultValue is compared with a tolerance rather than exact float
// equality, since it's computed the same way (fractions of a percent
// divided by 100) but independently from percentValues()'s own values.
function populateSelect(id, values, format = String, defaultValue) {
    const select = document.getElementById(id);
    for (const value of values) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = format(value);
        if (defaultValue !== undefined && Math.abs(value - defaultValue) < 1e-9) {
            option.selected = true;
        }
        select.appendChild(option);
    }
}

function range(start, end) {
    const values = [];
    for (let v = start; v <= end; v++) {
        values.push(v);
    }
    return values;
}

// value*100 as a percent, without a trailing ".0" for whole numbers.
function formatPercent(rate) {
    const pct = rate * 100;
    return `${Number(pct.toFixed(1))}%`;
}

function percentValues(minPct, maxPct, stepPct) {
    const values = [];
    for (let pct = minPct; pct <= maxPct + 1e-9; pct += stepPct) {
        values.push(Number(pct.toFixed(4)) / 100);
    }
    return values;
}

function populateSelects() {
    const year = new Date().getFullYear();
    populateSelect('birthYear', range(year - 75, year));
    populateSelect('mortgageEndYear', range(year, year + 30));
    populateSelect('inheritedIraYear', range(year - 30, year));
    populateSelect('lifeExpectancy', range(80, 110), String, 90);
    populateSelect('retirementYear', range(year, year + 30));
    populateSelect('inflation', percentValues(0, 10, 0.5), formatPercent, 0.025);
    populateSelect('interestRate', percentValues(1, 5, 1), formatPercent, 0.03);
    populateSelect('investmentReturn', percentValues(5, 15, 1), formatPercent, 0.07);
}

function numOrUndefined(id) {
    const value = document.getElementById(id).value;
    return value === '' ? undefined : Number(value);
}

function selectNumber(id) {
    return Number(document.getElementById(id).value);
}

// A balance with no rate/year/etc alongside it produces a nonsensical
// (NaN-driven) account -- financial correctness takes priority over a
// convenient form, so this blocks submission instead of silently
// computing garbage (CLAUDE.md's Goal states correctness comes first).
function validate(input) {
    if (input.mortgageBalance && (input.mortgageRate === undefined || input.mortgageEndYear === undefined)) {
        return 'Mortgage rate and end year are required when a mortgage balance is entered.';
    }
    if (input.inheritedIraBalance && input.inheritedIraYear === undefined) {
        return 'Inherited year is required when a non-spousal inherited IRA balance is entered.';
    }
    return null;
}

function readForm() {
    const mortgageRatePercent = numOrUndefined('mortgageRate');
    return {
        birthYear: selectNumber('birthYear'),
        salary: numOrUndefined('salary'),
        socialSecurityAt67: numOrUndefined('socialSecurityAt67'),
        medicarePartG: numOrUndefined('medicarePartG'),
        mortgageBalance: numOrUndefined('mortgageBalance'),
        mortgageRate: mortgageRatePercent === undefined ? undefined : mortgageRatePercent / 100,
        mortgageEndYear: numOrUndefined('mortgageEndYear'),
        taxableBalance: numOrUndefined('taxableBalance'),
        traditionalIraBalance: numOrUndefined('traditionalIraBalance'),
        rothIraBalance: numOrUndefined('rothIraBalance'),
        inheritedIraBalance: numOrUndefined('inheritedIraBalance'),
        inheritedIraYear: numOrUndefined('inheritedIraYear'),
        hsaBalance: numOrUndefined('hsaBalance'),
        lifeExpectancy: selectNumber('lifeExpectancy'),
        retirementYear: selectNumber('retirementYear'),
        yearlySpending: numOrUndefined('yearlySpending'),
        inflation: selectNumber('inflation'),
        interestRate: selectNumber('interestRate'),
        investmentReturn: selectNumber('investmentReturn'),
    };
}

function renderResults(results) {
    const resultsDiv = document.getElementById('results');
    resultsDiv.innerHTML = '';
    const pre = document.createElement('pre');
    pre.textContent = new OptimizerReport().report(results);
    resultsDiv.appendChild(pre);

    // The last variable's winning candidate is the final plan -- its
    // year-by-year net worth is what the graph shows. Optimizer.js
    // returns null/null for a winner that ran out of money, in which
    // case there's nothing meaningful to graph.
    const finalPlan = results[results.length - 1];
    const canvas = document.getElementById('netWorthChart');
    if (finalPlan.netWorthByYear) {
        renderNetWorthChart(canvas, finalPlan.netWorthByYear);
    } else {
        canvas.style.display = 'none';
    }
}

populateSelects();

// Inherited year only means anything once a non-spousal inherited IRA
// balance is entered -- hidden until then instead of showing an
// always-visible field most people will never touch.
document.getElementById('inheritedIraBalance').addEventListener('input', (event) => {
    document.getElementById('inheritedIraYearField').style.display = event.target.value ? '' : 'none';
});

// Mortgage rate/end year only mean anything once a mortgage balance is
// entered -- same treatment as inherited year above.
document.getElementById('mortgageBalance').addEventListener('input', (event) => {
    const display = event.target.value ? '' : 'none';
    document.getElementById('mortgageRateField').style.display = display;
    document.getElementById('mortgageEndYearField').style.display = display;
});

document.getElementById('planForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const input = readForm();
    const problem = validate(input);
    if (problem) {
        alert(problem);
        return;
    }
    const configData = buildConfigData(input);
    const results = new Optimizer().runAll(configData, classes, OPTIMIZE_VARIABLES);
    renderResults(results);
});
