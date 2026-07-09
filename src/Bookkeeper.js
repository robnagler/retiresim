import { Base } from './Base.js';

export class Bookkeeper extends Base {
    constructor({ config, classes }) {
        super({ config });
        const accounts = this.cfg.accountClasses.map((name) => {
            const c = config.get(name);
            const t = classes[c.class ?? name];
            return new t({ name, config });
        });
        this.accounts = accounts.sort((x, y) => x.priority - y.priority);
        this.journal = [];
    }

    post(journalEntry) {
        this.journal.push(journalEntry);
    }

    balanceChange(account, year) {
        return this.journal
            .filter((j) => j.year === year)
            .flatMap((j) => j.postings)
            .filter((p) => p.account === account)
            .reduce((s, p) => s + p.amount, 0);
    }

    runYear(year) {
        const b = this._snapshot();
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
