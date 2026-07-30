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
import { LumpSum } from '../biz/LumpSum.js';
import { RobustnessValidator } from '../biz/RobustnessValidator.js';
import { renderNetWorthChart, renderRobustnessChart } from './chart.js';
import { exportFileName } from './fileName.js';
import { ACCOUNT_COMMON_FIELDS, ACCOUNT_TYPES, defaultAccountName } from './accountTypes.js';
import { FIELD_HELP } from './help.js';

const classes = {
    TaxableAccount, TraditionalIra, NonSpousalInheritedIra, RothIra, HsaAccount,
    Mortgage, LivingExpense, TaxCalculator, Medicare, Salary, SocialSecurity, Cash, LumpSum,
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

// The accounts being edited, as {type, name, balance, ...perTypeFields}.
// Held here rather than read back out of the DOM because a box shows only
// a summary -- the fields behind it exist in this array, not on the page,
// except while the dialog for one of them is open.
let accounts = [];
// Which account the open dialog is editing, by index. -1 while closed.
let editingAccount = -1;

const CURRENCY_BOX = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

function accountNames(exceptIndex) {
    return accounts.filter((unused, i) => i !== exceptIndex).map((account) => account.name);
}

// A box per account, rebuilt from scratch on every change: the list is
// short, and rebuilding avoids keeping DOM nodes and array indexes in
// agreement, which is where this kind of code usually goes wrong.
function renderAccountBoxes() {
    const container = document.getElementById('accountBoxes');
    container.innerHTML = '';
    accounts.forEach((account, index) => {
        const box = document.createElement('button');
        box.type = 'button';
        box.className = 'box';
        const line = (text, className) => {
            const el = document.createElement('span');
            el.className = className;
            el.textContent = text;
            box.appendChild(el);
        };
        line(account.name, 'box-name');
        line(account.balance === undefined ? 'no balance' : CURRENCY_BOX.format(account.balance), 'box-balance');
        // Only worth a line when it says something the name does not: a
        // box named for its own type would otherwise repeat itself.
        if (account.name !== ACCOUNT_TYPES[account.type].label) {
            line(ACCOUNT_TYPES[account.type].label, 'box-type');
        }
        box.addEventListener('click', () => openAccountDialog(index));
        container.appendChild(box);
    });
}

function accountFieldId(key) {
    return `accountField-${key}`;
}

// The dialog's contents are built per account rather than written into the
// page once, since which fields exist depends on the type being edited.
function renderAccountFields(account) {
    const container = document.getElementById('accountFields');
    container.innerHTML = '';
    for (const field of [...ACCOUNT_COMMON_FIELDS, ...ACCOUNT_TYPES[account.type].fields]) {
        const wrapper = document.createElement('div');
        wrapper.className = 'field';
        const label = document.createElement('label');
        label.htmlFor = accountFieldId(field.key);
        label.textContent = field.label;
        const input = document.createElement('input');
        input.id = accountFieldId(field.key);
        input.type = field.kind === 'text' ? 'text' : 'number';
        if (field.kind === 'money') {
            input.min = '0';
        }
        if (field.kind === 'percent') {
            input.min = '0';
            input.step = '0.01';
        }
        input.value = accountFieldValue(account, field);
        wrapper.append(label, input);
        container.appendChild(wrapper);
        attachHelp(label, field.help, `${accountFieldId(field.key)}Help`);
    }
    wireHelpPopovers(container);
}

// Percentages are held as fractions everywhere else, and shown as percent
// here, the same way the old fixed mortgage-rate field did.
function accountFieldValue(account, field) {
    const value = account[field.key];
    if (value === undefined) {
        return '';
    }
    return field.kind === 'percent' ? value * 100 : value;
}

function readAccountFields(account) {
    const rv = { type: account.type };
    for (const field of [...ACCOUNT_COMMON_FIELDS, ...ACCOUNT_TYPES[account.type].fields]) {
        const raw = document.getElementById(accountFieldId(field.key)).value;
        if (field.kind === 'text') {
            rv[field.key] = raw;
        } else if (raw !== '') {
            rv[field.key] = field.kind === 'percent' ? Number(raw) / 100 : Number(raw);
        }
    }
    return rv;
}

function openAccountDialog(index) {
    editingAccount = index;
    const account = accounts[index];
    document.getElementById('accountDialogTitle').textContent = ACCOUNT_TYPES[account.type].label;
    renderAccountFields(account);
    document.getElementById('accountDialog').showModal();
}

// Rejected here rather than at Optimize time: the name is what the box
// shows and what the results are labelled with, and two accounts sharing
// one would have Bookkeeper silently keep only the second.
function accountProblem(edited) {
    if (!edited.name) {
        return 'An account needs a name.';
    }
    if (accountNames(editingAccount).includes(edited.name)) {
        return `There is already an account called ${edited.name}.`;
    }
    return null;
}

function saveAccountDialog() {
    const edited = readAccountFields(accounts[editingAccount]);
    const problem = accountProblem(edited);
    if (problem) {
        alert(problem);
        openAccountDialog(editingAccount);
        return;
    }
    accounts[editingAccount] = edited;
    editingAccount = -1;
    renderAccountBoxes();
    setUnexportedChanges(true);
}

function addAccount(type) {
    accounts.push({ type, name: defaultAccountName(type, accountNames(-1)) });
    renderAccountBoxes();
    setUnexportedChanges(true);
    openAccountDialog(accounts.length - 1);
}

function deleteAccount() {
    accounts.splice(editingAccount, 1);
    editingAccount = -1;
    document.getElementById('accountDialog').close();
    renderAccountBoxes();
    setUnexportedChanges(true);
}

// One-time expenses are rows rather than boxes: a year and an amount is
// the whole of one, so a dialog would be more ceremony than content.
function addLumpSumRow(lumpSum = {}) {
    const row = document.createElement('div');
    row.className = 'lump-row';
    const year = document.createElement('select');
    year.className = 'lump-year';
    year.setAttribute('aria-label', 'Year of the expense');
    const thisYear = new Date().getFullYear();
    for (const value of range(thisYear, thisYear + 50)) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = value;
        option.selected = value === lumpSum.year;
        year.appendChild(option);
    }
    const amount = document.createElement('input');
    amount.type = 'number';
    amount.min = '0';
    amount.className = 'lump-amount';
    amount.setAttribute('aria-label', 'Amount of the expense');
    amount.placeholder = 'Amount';
    if (lumpSum.amount !== undefined) {
        amount.value = lumpSum.amount;
    }
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'danger';
    remove.textContent = 'Remove';
    remove.addEventListener('click', () => {
        row.remove();
        setUnexportedChanges(true);
    });
    row.append(year, amount, remove);
    document.getElementById('lumpSumRows').appendChild(row);
}

function readLumpSums() {
    return [...document.querySelectorAll('.lump-row')].map((row) => ({
        year: Number(row.querySelector('.lump-year').value),
        amount: row.querySelector('.lump-amount').value === '' ? undefined : Number(row.querySelector('.lump-amount').value),
    }));
}

// Bumped whenever the shape below changes incompatibly. Import refuses a
// file it does not recognise rather than filling the form from fields that
// no longer mean what they did -- the failure the monthly rename avoided
// only because the old keys happened not to match the new ones.
export const INPUT_VERSION = 1;

// A balance with no rate/year/etc alongside it produces a nonsensical
// (NaN-driven) account -- financial correctness takes priority over a
// convenient form, so this blocks submission instead of silently
// computing garbage (CLAUDE.md's Goal states correctness comes first).
function validate(input) {
    for (const account of input.accounts) {
        for (const field of ACCOUNT_TYPES[account.type].fields) {
            if (account.balance && account[field.key] === undefined) {
                return `${account.name} needs ${field.label} filled in.`;
            }
        }
    }
    return null;
}

function readForm() {
    return {
        version: INPUT_VERSION,
        birthYear: selectNumber('birthYear'),
        monthlySalary: numOrUndefined('monthlySalary'),
        socialSecurityAt67: numOrUndefined('socialSecurityAt67'),
        medicarePartG: numOrUndefined('medicarePartG'),
        accounts: structuredClone(accounts),
        lumpSums: readLumpSums(),
        lifeExpectancy: selectNumber('lifeExpectancy'),
        retirementYear: selectNumber('retirementYear'),
        monthlySpending: numOrUndefined('monthlySpending'),
        inflation: selectNumber('inflation'),
        interestRate: selectNumber('interestRate'),
        investmentReturn: selectNumber('investmentReturn'),
    };
}

// Inverse of readForm() -- populates the form from a previously-exported
// input object. Fields the imported object doesn't set are cleared back to
// blank rather than left as whatever the form happened to already show.
function populateForm(input) {
    setValue('birthYear', input.birthYear);
    setValue('monthlySalary', input.monthlySalary);
    setValue('socialSecurityAt67', input.socialSecurityAt67);
    setValue('medicarePartG', input.medicarePartG);
    setValue('lifeExpectancy', input.lifeExpectancy);
    setValue('retirementYear', input.retirementYear);
    setValue('monthlySpending', input.monthlySpending);
    setValue('inflation', input.inflation);
    setValue('interestRate', input.interestRate);
    setValue('investmentReturn', input.investmentReturn);
    accounts = structuredClone(input.accounts ?? []);
    renderAccountBoxes();
    document.getElementById('lumpSumRows').innerHTML = '';
    for (const lumpSum of input.lumpSums ?? []) {
        addLumpSumRow(lumpSum);
    }
}

// Triggers a browser download of the current form's fields as JSON --
// "the fields only" per CLAUDE.md's UI spec, i.e. readForm()'s raw input
// shape, not buildConfigData()'s expanded simulation config.
//
// The name carries a timestamp (see fileName.js) so each export is its own
// file. Without one every export is retirement-plan.json and the browser
// disambiguates them as "(1)", "(2)", numbered by the order they were
// saved and saying nothing about which is which.
function exportFields() {
    const blob = new Blob([JSON.stringify(readForm(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = exportFileName(new Date());
    link.click();
    URL.revokeObjectURL(url);
}

// Refuses a file from a different version rather than filling the form
// from fields that may no longer mean what they did. Exports predating the
// version field are the ones this is really about: their account fields
// were flat and named differently, so silently accepting one would drop
// every account without saying so.
async function importFields(file) {
    const input = JSON.parse(await file.text());
    if (input.version !== INPUT_VERSION) {
        alert(`This file was saved by a different version of the simulator (${input.version ?? 'no version'}, expected ${INPUT_VERSION}) and cannot be imported.`);
        return;
    }
    populateForm(input);
}

// Every chart currently drawn, so a second Optimize click destroys them
// before drawing again -- Chart.js throws if a chart is created on a canvas
// that already has one attached.
let currentCharts = [];

// Draws into the named canvas and shows its container, or hides the
// container when there is nothing to draw -- an empty chart frame reads as
// a broken page rather than as an absence of data.
function drawChart(containerId, canvasId, series, render) {
    const container = document.getElementById(containerId);
    if (!series) {
        container.style.display = 'none';
        return;
    }
    container.style.display = '';
    currentCharts.push(render(document.getElementById(canvasId), series));
}

// How many sampled market histories the robustness check runs. Two hundred
// is the same default the command line uses, and takes well under a second,
// so there is no case for making the user ask for it separately.
const ROBUSTNESS_TRIALS = 200;

// The optimizer answers "what is the best plan under one assumed return
// every year," which is never what happens. Running the winner straight
// through the robustness validator answers the question that assumption
// leaves open -- how often this plan survives real market history -- and
// doing it automatically means the plan being stress-tested is always the
// plan just chosen, rather than whatever was last copied somewhere by hand.
function renderRobustness(configData, results) {
    const container = document.getElementById('robustness');
    container.innerHTML = '';
    const winning = new Optimizer().winningConfigData(configData, results, OPTIMIZE_VARIABLES);
    const trials = new RobustnessValidator().run(winning, classes, ROBUSTNESS_TRIALS);
    const insolvent = trials.filter((t) => t.failedYear !== null);
    const survived = trials.length - insolvent.length;
    const sorted = trials.map((t) => t.netWorth).sort((a, b) => a - b);
    const percentile = (p) => sorted[Math.floor(p * (sorted.length - 1))];

    const p = (text) => {
        const el = document.createElement('p');
        el.textContent = text;
        container.appendChild(el);
    };
    p(`Tested against ${trials.length} sampled market histories: the money lasted in ${survived} of them (${((100 * survived) / trials.length).toFixed(0)}%).`);
    // Median rather than mean: the spread is heavily right-skewed, since a
    // few lucky histories compound to outsized totals while every insolvent
    // one sits at exactly zero.
    p(`Typical ending net worth ${CURRENCY.format(percentile(0.5))}, ranging from ${CURRENCY.format(percentile(0.1))} in the worst tenth to ${CURRENCY.format(percentile(0.9))} in the best tenth.`);
    if (insolvent.length) {
        const years = insolvent.map((t) => t.failedYear);
        p(`When it ran out, that happened between ${Math.min(...years)} and ${Math.max(...years)}.`);
    }
    return trials;
}

function renderResults(configData, results) {
    renderStrategy(document.getElementById('results'), results);

    for (const chart of currentCharts) {
        chart.destroy();
    }
    currentCharts = [];

    // The last variable's winning candidate is the final plan -- its
    // year-by-year series are what the graphs show. Optimizer.js returns
    // nulls for a winner that ran out of money, in which case there's
    // nothing meaningful to graph. The net-worth chart is drawn from the
    // per-account balances rather than netWorthByYear: stacked, they are
    // the same curve, with the accounts making it up shown underneath.
    const finalPlan = results[results.length - 1];
    drawChart('chartContainer', 'netWorthChart', finalPlan.balancesByYear, renderNetWorthChart);
    // A plan that already fails under one steady return has nothing to
    // learn from a hundred worse ones.
    const trials = finalPlan.netWorthByYear ? renderRobustness(configData, results) : null;
    if (trials === null) {
        document.getElementById('robustness').innerHTML = '';
    }
    drawChart('robustnessChartContainer', 'robustnessChart', trials, renderRobustnessChart);
}

// How far down and right of the [?] the popover's top-left corner sits,
// and the breathing room kept against the viewport edges.
const POPOVER_OFFSET = 8;
const POPOVER_MARGIN = 8;
// Long enough to move the pointer off the [?] and into the popover
// without it vanishing on the way.
const HIDE_DELAY_MS = 150;

// Places the popover's top-left corner just right of and below the [?]
// itself, not the pointer: the pointer can be anywhere within the button
// (and is nowhere at all when the button is reached by keyboard), so
// anchoring to it makes the same help land in a different spot each time.
// Only clamped, never flipped to another side: an earlier version flipped a
// tall popover above its button, which threw the intro's help into the far
// corner of the screen instead of near its [?]. Measured after
// showPopover(), since a closed popover is display:none and measures zero.
function placePopover(popover, button) {
    const anchor = button.getBoundingClientRect();
    const width = popover.offsetWidth;
    const height = popover.offsetHeight;
    const left = Math.min(anchor.right + POPOVER_OFFSET, window.innerWidth - width - POPOVER_MARGIN);
    const top = Math.min(anchor.bottom + POPOVER_OFFSET, window.innerHeight - height - POPOVER_MARGIN);
    popover.style.left = `${Math.max(POPOVER_MARGIN, left)}px`;
    popover.style.top = `${Math.max(POPOVER_MARGIN, top)}px`;
}

// One {popover, close} per wired [?], so a single document-level listener
// can dismiss them all rather than every popover carrying its own.
let helpControls = [];

// Hover opens, clicking pins it open until clicked again. The popover
// attribute is "manual" rather than the default "auto" precisely because
// auto's built-in light dismiss closes on any outside pointerdown, which
// fights the pin: the click that is supposed to pin it would dismiss it
// first. Manual means every open and close is the code's decision.
function wireHelp(button, popover) {
    let pinned = false;
    let hideTimer = null;
    const isOpen = () => popover.matches(':popover-open');
    const hide = () => {
        if (isOpen()) {
            popover.hidePopover();
        }
    };
    const show = () => {
        if (!isOpen()) {
            popover.showPopover();
        }
        placePopover(popover, button);
    };
    const cancelHide = () => clearTimeout(hideTimer);
    const scheduleHide = () => {
        cancelHide();
        hideTimer = setTimeout(() => {
            if (!pinned) {
                hide();
            }
        }, HIDE_DELAY_MS);
    };

    button.addEventListener('mouseenter', () => {
        cancelHide();
        show();
    });
    button.addEventListener('mouseleave', scheduleHide);
    // Hovering the popover itself keeps it open, so its text can be read
    // and selected without the pointer leaving the [?] closing it.
    popover.addEventListener('mouseenter', cancelHide);
    popover.addEventListener('mouseleave', scheduleHide);
    button.addEventListener('focus', show);
    button.addEventListener('blur', () => {
        if (!pinned) {
            hide();
        }
    });
    button.addEventListener('click', (event) => {
        // Without this the document listener below would treat the click
        // as an outside click and immediately unpin it again.
        event.stopPropagation();
        pinned = !pinned;
        if (pinned) {
            cancelHide();
            show();
        } else {
            hide();
        }
    });
    // A pinned popover is position: fixed while its [?] scrolls with the
    // page, so without this the two drift apart.
    for (const event of ['scroll', 'resize']) {
        window.addEventListener(event, () => {
            if (isOpen()) {
                placePopover(popover, button);
            }
        });
    }

    helpControls.push({
        popover,
        close: () => {
            pinned = false;
            cancelHide();
            hide();
        },
    });
}

// Buttons point at their popover with data-help-for rather than the native
// popovertarget: popovertarget makes the browser toggle the popover itself,
// which would double up with the click-to-pin handling above.
//
// Takes a root because the account dialog builds its fields fresh every
// time it opens, so its [?] buttons are not on the page when the form's
// own are wired. Controls whose popover has since been discarded with the
// dialog contents are dropped here rather than accumulating.
function wireHelpPopovers(root = document) {
    helpControls = helpControls.filter((control) => control.popover.isConnected);
    for (const button of root.querySelectorAll('[data-help-for]')) {
        wireHelp(button, document.getElementById(button.dataset.helpFor));
    }
}

// Attached once, not per root: these are document-level, and wiring them
// again for every dialog would close each popover as many times as the
// dialog had been opened.
function wireHelpDismissal() {
    // Any click closes every open help, wherever it landed -- including
    // inside the popover itself, which is the quickest way to get rid of
    // one you have finished reading. The only exception is a click on a
    // [?] button, whose own handler stops propagation before this runs so
    // it can pin instead.
    document.addEventListener('click', () => {
        for (const control of helpControls) {
            control.close();
        }
    });
    // Manual popovers opt out of the browser's own Esc handling along with
    // its light dismiss, so closing on Esc is this code's job too.
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            for (const control of helpControls) {
                control.close();
            }
        }
    });
}

// Builds one [?] and its popover for a label. Uses the native popover API
// -- the browser handles top-layer rendering, so there are no z-index
// fights -- with placement and the hover/pin behaviour handled above.
function attachHelp(label, text, popoverId) {
    const popover = document.createElement('div');
    popover.id = popoverId;
    popover.setAttribute('popover', 'manual');
    // textContent, not innerHTML: this is prose, and prose is allowed to
    // contain characters that would otherwise be markup.
    popover.textContent = text;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'help';
    button.textContent = '?';
    // No title attribute: the popover already opens on hover, and the
    // browser's own tooltip would appear on top of it saying the same
    // thing.
    button.setAttribute('aria-label', `More about ${label.textContent.trim()}`);
    button.dataset.helpFor = popover.id;
    label.append(button);
    label.after(popover);
}

// One [?] per labeled field on the form itself, generated rather than
// written into the markup a dozen times over. The account dialog's fields
// get theirs from renderAccountFields(), which calls attachHelp directly.
function attachFieldHelp() {
    for (const [id, text] of Object.entries(FIELD_HELP)) {
        const label = document.querySelector(`label[for="${id}"]`);
        if (label === null) {
            throw new Error(`id=${id} has help text but no labeled field`);
        }
        attachHelp(label, text, `${id}Help`);
    }
}

// Tracks edits made since the last Export, so the leave-the-page warning
// only fires when there is something a user might actually want in a file.
//
// Nothing is written to localStorage or sessionStorage: these are real
// financial figures, and leaving them on disk for whoever opens the browser
// next is a worse failure than retyping them. A reload therefore starts
// empty by design, and Export is the only way to keep a copy -- which is
// exactly what the warning below exists to remind someone of.
let unexportedChanges = false;

// Highlighting Export is the visible half of the same state: the browser's
// leave-the-page dialog only appears once someone is already leaving, so
// the button itself has to show there is something worth saving before
// then.
function setUnexportedChanges(value) {
    unexportedChanges = value;
    document.getElementById('exportButton').classList.toggle('needs-export', value);
}

populateSelects();
attachFieldHelp();
// After attachFieldHelp(), so the generated [?] buttons are included.
wireHelpPopovers();
wireHelpDismissal();

for (const [type, spec] of Object.entries(ACCOUNT_TYPES)) {
    const option = document.createElement('option');
    option.value = type;
    option.textContent = spec.label;
    document.getElementById('addAccountType').appendChild(option);
}

document.getElementById('addAccountButton').addEventListener('click', () => {
    addAccount(document.getElementById('addAccountType').value);
});

// A dialog form submitted with method="dialog" closes it and reports which
// button was used, so Cancel needs no handler of its own: it simply is not
// "save", and the edits live only in the dialog's inputs until then.
document.getElementById('accountForm').addEventListener('submit', (event) => {
    if (event.submitter.value === 'save') {
        saveAccountDialog();
    } else {
        editingAccount = -1;
    }
});

document.getElementById('deleteAccountButton').addEventListener('click', deleteAccount);

document.getElementById('addLumpSumButton').addEventListener('click', () => {
    addLumpSumRow();
    setUnexportedChanges(true);
});

document.getElementById('planForm').addEventListener('input', () => {
    setUnexportedChanges(true);
});

// Browsers deliberately ignore any custom message here and show their own
// generic wording, so this can only prompt -- it cannot say "use Export".
// The note under the buttons carries that message instead, where a page is
// actually allowed to say something.
window.addEventListener('beforeunload', (event) => {
    if (unexportedChanges) {
        event.preventDefault();
    }
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
    renderResults(configData, results);
});

document.getElementById('exportButton').addEventListener('click', () => {
    exportFields();
    setUnexportedChanges(false);
});

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
        // These values already exist in a file the user chose, so there is
        // nothing unexported to warn about yet.
        setUnexportedChanges(false);
    }
    event.target.value = '';
});
