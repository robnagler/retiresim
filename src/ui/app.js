// DOM glue only, no independent logic of its own -- reads the form,
// calls buildConfigData()/Optimizer.runAll()/renderNetWorthChart(), same
// "thin dispatcher" precedent as src/cli/main.js. No test file, for the
// same reason main.js has none: all the real logic lives in the tested
// modules this file just calls.
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
import { renderNetWorthChart } from './chart.js';

const classes = {
    TaxableAccount, TraditionalIra, NonSpousalInheritedIra, RothIra, HsaAccount,
    Mortgage, LivingExpense, TaxCalculator, Medicare, Salary, SocialSecurity, Cash,
};

const CURRENCY = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

// Strips the bracket-index suffix candidate.columns' cap strings carry
// (e.g. "49,000[0]") -- meaningful in the CLI table, where it cross-
// references cfg.json's ltcgCeilingBracket/incomeCeilingBracket fields,
// but meaningless jargon in a plain-language sentence. "none" (no cap)
// becomes null (no cap line for that step) rather than a formatted string.
function formatCap(cap) {
    return cap === 'none' ? null : `$${cap.replace(/\[\d+\]$/, '')}`;
}

// Cash.js's categoryOf() identifiers, translated to the account type each
// one is mostly drawn from -- a generalization (categoryOf() also puts
// NonSpousalInheritedIra under 'income' and HsaAccount under 'taxFree',
// but HsaAccount is never actually part of produce()'s withdrawal walk --
// see CLAUDE.md's Cash.js note -- so 'taxFree' means RothIra in practice
// for this list).
const CATEGORY_ACCOUNT_NAME = { ltcg: 'Taxable Account', income: 'Traditional IRA', taxFree: 'Roth IRA' };

function categoryCap(candidate, category) {
    if (category === 'ltcg') {
        return formatCap(candidate.columns['ltcg cap']);
    }
    if (category === 'income') {
        return formatCap(candidate.columns['income cap']);
    }
    return null;
}

// Builds the plain-language strategy summary directly as DOM nodes
// (headline, a note on the chosen Social Security claim age, an ordered
// withdrawal-sequence list) -- replaces the raw CLI-style candidate/
// ending-balances table, fine on a terminal, not on a web page.
//
// Net worth/failure come from the *last* OPTIMIZE_VARIABLES result --
// since runAll() folds each variable's winner into the next one's
// evaluation, only the last variable's own re-run reflects every
// variable's choice combined (the final plan) -- same choice
// renderResults() already makes for the chart. The withdrawal-order and
// claim-age details themselves are looked up by label instead, since
// with two variables now in OPTIMIZE_VARIABLES neither is reliably
// "last" -- see Optimizer.js's runAll() doc comment for why withdrawal
// order specifically runs first.
function renderStrategy(container, results) {
    container.innerHTML = '';
    const finalPlan = results[results.length - 1];
    const finalCandidate = finalPlan.netWorth.best;
    const failedYear = finalPlan.failedYears.get(finalCandidate);

    const p = (text) => {
        const el = document.createElement('p');
        el.textContent = text;
        container.appendChild(el);
    };

    if (failedYear !== undefined) {
        p(`This plan runs out of money in ${failedYear}. Try lowering yearly spending or adjusting other assumptions.`);
        return;
    }

    p(`Simulation results: net worth ${CURRENCY.format(finalPlan.netWorth.score)} at life expectancy.`);

    const claimAge = results.find((r) => r.label === 'Social Security claim age').netWorth.best;
    if (claimAge !== undefined) {
        p(`Social Security starts at age ${claimAge} -- chosen to maximize lifetime benefit without running out of money before then.`);
    }

    const withdrawalCandidate = results.find((r) => r.label === 'Withdrawal category order + ceilings').netWorth.best;
    if (withdrawalCandidate.categoryOrder) {
        p('Account withdrawal sequence for this strategy to work:');
        const list = document.createElement('ol');
        for (const category of withdrawalCandidate.categoryOrder) {
            const cap = categoryCap(withdrawalCandidate, category);
            const item = document.createElement('li');
            item.textContent = `${CATEGORY_ACCOUNT_NAME[category] ?? category}${cap ? ` up to ${cap} per year` : ''}`;
            list.appendChild(item);
        }
        container.appendChild(list);
    }
}

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

// value === undefined clears the field back to blank (used on import, so
// re-importing over a partially-filled form doesn't leave stale values
// behind in fields the imported file doesn't set).
function setValue(id, value) {
    document.getElementById(id).value = value === undefined ? '' : value;
}

function updateMortgageFieldsVisibility() {
    const display = document.getElementById('mortgageBalance').value ? '' : 'none';
    document.getElementById('mortgageRateField').style.display = display;
    document.getElementById('mortgageEndYearField').style.display = display;
}

function updateInheritedYearVisibility() {
    document.getElementById('inheritedIraYearField').style.display = document.getElementById('inheritedIraBalance').value ? '' : 'none';
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

// Inverse of readForm() -- populates the form from a previously-exported
// input object (see exportFields()/importFields() below). Fields the
// imported object doesn't set are cleared back to blank rather than left
// as whatever the form happened to already show.
function populateForm(input) {
    setValue('birthYear', input.birthYear);
    setValue('salary', input.salary);
    setValue('socialSecurityAt67', input.socialSecurityAt67);
    setValue('medicarePartG', input.medicarePartG);
    setValue('mortgageBalance', input.mortgageBalance);
    setValue('mortgageRate', input.mortgageRate === undefined ? undefined : input.mortgageRate * 100);
    setValue('mortgageEndYear', input.mortgageEndYear);
    setValue('taxableBalance', input.taxableBalance);
    setValue('traditionalIraBalance', input.traditionalIraBalance);
    setValue('rothIraBalance', input.rothIraBalance);
    setValue('inheritedIraBalance', input.inheritedIraBalance);
    setValue('inheritedIraYear', input.inheritedIraYear);
    setValue('hsaBalance', input.hsaBalance);
    setValue('lifeExpectancy', input.lifeExpectancy);
    setValue('retirementYear', input.retirementYear);
    setValue('yearlySpending', input.yearlySpending);
    setValue('inflation', input.inflation);
    setValue('interestRate', input.interestRate);
    setValue('investmentReturn', input.investmentReturn);
    updateMortgageFieldsVisibility();
    updateInheritedYearVisibility();
}

// Triggers a browser download of the current form's fields as JSON --
// "the fields only" per CLAUDE.md's UI spec, i.e. readForm()'s raw input
// shape, not buildConfigData()'s expanded simulation config.
function exportFields() {
    const blob = new Blob([JSON.stringify(readForm(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'retirement-plan.json';
    link.click();
    URL.revokeObjectURL(url);
}

async function importFields(file) {
    populateForm(JSON.parse(await file.text()));
}

// Holds the currently-drawn chart, if any, so a second Optimize click
// destroys it before drawing a new one -- Chart.js throws if a chart is
// created on a canvas that already has one attached.
let currentChart = null;

function renderResults(results) {
    renderStrategy(document.getElementById('results'), results);

    currentChart?.destroy();
    currentChart = null;

    // The last variable's winning candidate is the final plan -- its
    // year-by-year net worth is what the graph shows. Optimizer.js
    // returns null/null for a winner that ran out of money, in which
    // case there's nothing meaningful to graph.
    const finalPlan = results[results.length - 1];
    const chartContainer = document.getElementById('chartContainer');
    if (finalPlan.netWorthByYear) {
        chartContainer.style.display = '';
        currentChart = renderNetWorthChart(document.getElementById('netWorthChart'), finalPlan.netWorthByYear);
    } else {
        chartContainer.style.display = 'none';
    }
}

populateSelects();

// Inherited year only means anything once a non-spousal inherited IRA
// balance is entered -- hidden until then instead of showing an
// always-visible field most people will never touch.
document.getElementById('inheritedIraBalance').addEventListener('input', updateInheritedYearVisibility);

// Mortgage rate/end year only mean anything once a mortgage balance is
// entered -- same treatment as inherited year above.
document.getElementById('mortgageBalance').addEventListener('input', updateMortgageFieldsVisibility);

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

document.getElementById('exportButton').addEventListener('click', exportFields);

// Clicking the visible "Import" button just proxies to the hidden real
// file input, since styling a native file input consistently with the
// rest of the form isn't possible.
document.getElementById('importButton').addEventListener('click', () => {
    document.getElementById('importFile').click();
});
document.getElementById('importFile').addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (file) {
        await importFields(file);
    }
    event.target.value = '';
});
