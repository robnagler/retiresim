import { HsaAccount } from '../biz/HsaAccount.js';
import { InsufficientFundsError } from '../biz/InsufficientFundsError.js';
import { NonSpousalInheritedIra } from '../biz/NonSpousalInheritedIra.js';
import { RothIra } from '../biz/RothIra.js';
import { Simulator } from '../biz/Simulator.js';
import { TaxableAccount } from '../biz/TaxableAccount.js';
import { TraditionalIra } from '../biz/TraditionalIra.js';
import { buildPipeline } from '../biz/pipeline.js';

// Left to right, with the label each column prints under.
const COLUMNS = [
    { key: 'earned', label: 'Earned' },
    { key: 'inherited', label: 'Inher' },
    { key: 'hsa', label: 'HSA' },
    { key: 'roth', label: 'Roth' },
    { key: 'traditional', label: 'Trad' },
    { key: 'taxable', label: 'Taxbl' },
    { key: 'living', label: 'Living' },
    { key: 'lump', label: 'Lump' },
    { key: 'mortgage', label: 'Mortg' },
    { key: 'medicare', label: 'Medic' },
    { key: 'tax', label: 'TaxPd' },
    { key: 'total', label: 'Total' },
    { key: 'netWorth', label: 'NetWorth' },
];

// A subclass has to come before the class it extends.
const SOURCES = [
    [NonSpousalInheritedIra, 'inherited'],
    [HsaAccount, 'hsa'],
    [RothIra, 'roth'],
    [TraditionalIra, 'traditional'],
    [TaxableAccount, 'taxable'],
];

const SPENDING = {
    LivingExpensePaid: 'living',
    LumpSumPaid: 'lump',
    MedicarePremium: 'medicare',
    MortgagePayment: 'mortgage',
    TaxPaid: 'tax',
};

const THOUSAND = 1000;

// The winning plan as one row per year: where the year's cash came from,
// what it went to, and net worth at year end. Builds strings like
// OptimizerReport does; only main.js prints.
export class YearTable {
    // Runs on the configured rates, not a sampled sequence, for the reason
    // main.js's per-year report does. A plan that runs out of money keeps
    // the rows before the failure.
    run(configData, classes) {
        const { config, bookkeeper } = buildPipeline(configData, classes);
        const rows = [];
        let failedYear = null;
        try {
            new Simulator({ bookkeeper, config }).run((year) => rows.push(this.row(bookkeeper, year)));
        } catch (err) {
            if (!(err instanceof InsufficientFundsError)) {
                throw err;
            }
            failedYear = err.year;
        }
        return { failedYear, rows };
    }

    // Dollars, not rounded -- lines() does the rounding, so a total is the
    // sum of the unrounded spending rather than of rounded columns.
    row(bookkeeper, year) {
        const rv = Object.fromEntries(COLUMNS.map((c) => [c.key, 0]));
        rv.year = year;
        for (const j of bookkeeper.journal.filter((e) => e.year === year)) {
            if (j.category === 'spend') {
                rv[this._spendingColumn(j)] += j.dest.amount;
            } else if (j.dest.account === bookkeeper.cash.name && j.category !== 'growth') {
                rv[this._sourceColumn(bookkeeper, j)] += j.dest.amount;
            }
        }
        rv.total = rv.living + rv.lump + rv.mortgage + rv.medicare + rv.tax;
        rv.netWorth = bookkeeper.netWorth();
        return rv;
    }

    lines({ failedYear, rows }) {
        const cells = rows.map((r) => [String(r.year), ...COLUMNS.map((c) => String(Math.round(r[c.key] / THOUSAND)))]);
        const headers = ['year', ...COLUMNS.map((c) => c.label)];
        const widths = headers.map((h, i) => Math.max(h.length, ...cells.map((c) => c[i].length)));
        const line = (cs) => cs.map((c, i) => c.padStart(widths[i])).join('  ');
        const rv = [
            "Cash by year, $k. Earned is salary and Social Security; the next five columns are what each account paid in. TaxPd is the previous year's tax.",
            line(headers),
            ...cells.map(line),
        ];
        if (failedYear !== null) {
            rv.push(`Stopped: out of money in ${failedYear}.`);
        }
        return rv;
    }

    report(result) {
        return this.lines(result).join('\n');
    }

    _sourceColumn(bookkeeper, journalEntry) {
        const name = journalEntry.source.account;
        if (name === 'IncomeEarned') {
            return 'earned';
        }
        const account = bookkeeper.accounts.find((a) => a.name === name);
        const found = SOURCES.find(([c]) => account instanceof c);
        if (!found) {
            throw new Error(`source=${name} has no column ${journalEntry}`);
        }
        return found[1];
    }

    _spendingColumn(journalEntry) {
        const rv = SPENDING[journalEntry.dest.account];
        if (!rv) {
            throw new Error(`dest=${journalEntry.dest.account} has no column ${journalEntry}`);
        }
        return rv;
    }
}
