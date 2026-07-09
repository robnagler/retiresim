import { Account } from './Account.js';
import { JournalEntry } from './JournalEntry.js';
import { Posting } from './Posting.js';

export class Cash extends Account {
    constructor({ name, config, accounts, spenders, earners }) {
        super({ name, config });
        this.accounts = accounts;
        this.spenders = spenders;
        this.earners = earners;
    }

    runYear({ year, bookkeeper }) {
        const e = this.earners.map((earner) => earner.earn());
        for (const x of e) {
            this.earn({ amount: x.amount, account: x.account, year, bookkeeper });
        }
        const d = this.spenders.map((spender) => spender.due());
        for (const x of d) {
            this.spend({ amount: x.amount, account: x.account, year, bookkeeper });
        }
        for (const spender of this.spenders) {
            if (spender.prepareNextYear) {
                spender.prepareNextYear({ year, bookkeeper });
            }
        }
        this.produce({ amount: -this.balance, year, bookkeeper });
    }

    earn({ amount, account, year, bookkeeper }) {
        this.deposit(amount);
        bookkeeper.post(new JournalEntry({
            year,
            category: 'earn',
            source: new Posting({ account: 'IncomeEarned', amount: -amount }),
            dest: new Posting({ account: this.name, amount }),
        }));
        bookkeeper.post(new JournalEntry({
            year,
            category: 'earn',
            source: new Posting({ account: 'IncomeEarned', amount: -amount }),
            dest: new Posting({ account, amount }),
        }));
    }

    withdraw(amount) {
        this.balance -= amount;
        return this.balance;
    }

    spend({ amount, account, year, bookkeeper }) {
        this.withdraw(amount);
        bookkeeper.post(new JournalEntry({
            year,
            category: 'spend',
            source: new Posting({ account: this.name, amount: -amount }),
            dest: new Posting({ account, amount }),
        }));
    }

    produce({ amount, year, bookkeeper }) {
        const rv = [];
        let r = amount;
        for (const { name: n } of this.cfg.withdrawalOrder) {
            if (r <= 0) {
                break;
            }
            const source = this.accounts.find((account) => account.name === n);
            const w = Math.min(r, source.balance);
            if (w <= 0) {
                continue;
            }
            source.withdraw(w);
            this.deposit(w);
            bookkeeper.post(new JournalEntry({
                year,
                category: `${source.constructor.name}Withdrawal`,
                source: new Posting({ account: source.name, amount: -w }),
                dest: new Posting({ account: this.name, amount: w }),
            }));
            rv.push({ account: n, amount: w });
            r -= w;
        }
        if (r > 0.005) {
            throw new Error(`insufficient funds shortfall=${r} amount=${amount} accounts=${this.accounts}`);
        }
        return rv;
    }
}
