import { Account } from './Account.js';
import { JournalEntry } from './JournalEntry.js';
import { Posting } from './Posting.js';

export class Cash extends Account {
    constructor({ name, config, accounts, spenders }) {
        super({ name, config });
        this.accounts = accounts;
        this.spenders = spenders;
    }

    runYear({ year, bookkeeper }) {
        const d = this.spenders.map((spender) => spender.due());
        for (const x of d) {
            this.spend({ amount: x.amount, account: x.account, year, bookkeeper });
        }
        this.produce({ amount: -this.balance, year, bookkeeper });
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
            postings: [
                new Posting({ account: this.name, amount: -amount }),
                new Posting({ account, amount }),
            ],
        }));
    }

    produce({ amount, year, bookkeeper }) {
        const rv = [];
        let r = amount;
        for (const n of this.cfg.withdrawalOrder) {
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
                postings: [
                    new Posting({ account: source.name, amount: -w }),
                    new Posting({ account: this.name, amount: w }),
                ],
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
