import { Base } from './Base.js';
import { JournalEntry } from './JournalEntry.js';
import { Posting } from './Posting.js';
import { TaxCalculator } from './TaxCalculator.js';
import { TaxableAccount } from './TaxableAccount.js';
import { TraditionalIra } from './TraditionalIra.js';
import { RothIra } from './RothIra.js';
import { Mortgage } from './Mortgage.js';

export class Bookkeeper extends Base {
    constructor({ config, classes }) {
        super({ config });
        const cash = config.get('Cash');
        const build = (entry) => {
            config.set(entry.name, entry);
            const t = classes[entry.class ?? entry.name];
            return new t({ name: entry.name, config });
        };
        const withdrawal = cash.withdrawalOrder.map(build);
        const spending = cash.spendingOrder.map(build);
        const income = (cash.incomeOrder ?? []).map(build);
        this.earners = [...withdrawal, ...income];
        this.cash = new classes.Cash({ config, accounts: withdrawal, spenders: spending });
        this.accounts = [...withdrawal, ...spending, ...income, this.cash];
        this.taxCalculator = this.accounts.find((a) => a instanceof TaxCalculator);
        this.journal = [];
    }

    post(journalEntry) {
        this.journal.push(journalEntry);
    }

    simplePost(year, category, source, dest, amount) {
        this.post(new JournalEntry({
            year,
            category,
            source: new Posting({ account: source, amount: -amount }),
            dest: new Posting({ account: dest, amount }),
        }));
    }

    balanceChange(account, year) {
        return this.journal
            .filter((j) => j.year === year)
            .flatMap((j) => [j.source, j.dest])
            .filter((p) => p.account === account)
            .reduce((s, p) => s + p.amount, 0);
    }

    runYear(year) {
        const b = this._snapshot();
        this.cash.earn(this.earners, year, this);
        for (const a of this.accounts) {
            a.runYear({ year, bookkeeper: this });
        }
        this._reconcile(year, b, this._snapshot());
    }

    _snapshot() {
        const rv = {};
        for (const a of this.accounts) {
            rv[a.name] = a.balance;
        }
        return rv;
    }

    // The optimizer's objective (CLAUDE.md's "Current Objective"): Taxable
    // + Traditional IRA + Roth IRA + Inherited IRA + HSA - remaining
    // mortgage balance. NonSpousalInheritedIra IS-A TraditionalIra and
    // HsaAccount IS-A RothIra, so the instanceof checks below already
    // cover them without double-counting. Deliberately excludes
    // TaxCalculator's balance (a year's accrued-but-unpaid liability, paid
    // the following year per the 1-year lag) -- CLAUDE.md's formula
    // doesn't mention it, and whether unpaid tax should reduce net worth
    // is an open question, not a silent choice made here.
    netWorth() {
        const isAsset = (a) => a instanceof TaxableAccount || a instanceof TraditionalIra || a instanceof RothIra;
        let rv = 0;
        for (const a of this.accounts) {
            if (isAsset(a) || a instanceof Mortgage) {
                rv += a.balance;
            }
        }
        return rv;
    }

    report() {
        const w = Math.max(...this.accounts.map((a) => a.name.length), 'Account'.length, 'Total'.length);
        const line = (name, balance) => `${name.padEnd(w)}  ${balance.padStart(12)}`;
        const rv = [line('Account', 'Balance')];
        let t = 0;
        for (const a of this.accounts) {
            rv.push(line(a.name, a.balance.toFixed(0)));
            t += a.balance;
        }
        rv.push(line('Total', t.toFixed(0)));
        return rv.join('\n');
    }

    // One row per JournalEntry -- category plus the source->dest movement --
    // for a single year, in the order they were posted.
    reportTransactions(year) {
        const entries = this.journal.filter((j) => j.year === year);
        const w = {
            category: Math.max(...entries.map((j) => j.category.length), 'Category'.length),
            source: Math.max(...entries.map((j) => j.source.account.length), 'Source'.length),
            dest: Math.max(...entries.map((j) => j.dest.account.length), 'Dest'.length),
        };
        const line = (category, source, dest, amount) => `${category.padEnd(w.category)}  ${source.padEnd(w.source)}  ${dest.padEnd(w.dest)}  ${amount.padStart(12)}`;
        const rv = [line('Category', 'Source', 'Dest', 'Amount')];
        for (const j of entries) {
            rv.push(line(j.category, j.source.account, j.dest.account, j.dest.amount.toFixed(2)));
        }
        return rv.join('\n');
    }

    reportYear(year) {
        return [
            `Year ${year}`,
            '',
            'Transactions',
            this.reportTransactions(year),
            '',
            'Balances',
            this.report(),
        ].join('\n');
    }

    _reconcile(year, beginning, ending) {
        const checkAccount = (account) => {
            const c = this.balanceChange(account.name, year);
            const d = ending[account.name] - beginning[account.name];
            if (Math.abs(c - d) <= 0.005) {
                return;
            }
            throw new Error(`year=${year} ledgerChange=${c} accountChange=${d} ${account}`);
        };
        for (const a of this.accounts) {
            checkAccount(a);
        }
    }
}
