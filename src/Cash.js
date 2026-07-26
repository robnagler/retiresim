import { Account } from './Account.js';

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
        // produce() must run before prepareNextYear(): a shortfall-covering
        // withdrawal here can itself post taxable income (TaxableAccount
        // gains, ad-hoc IRA withdrawals) that prepareNextYear() needs to see
        // for this same year.
        this.produce({ amount: -this.balance, year, bookkeeper });
        for (const spender of this.spenders) {
            if (spender.prepareNextYear) {
                spender.prepareNextYear({ year, bookkeeper });
            }
        }
    }

    earn(earners, year, bookkeeper) {
        const post = (e) => {
            this.deposit(e.amount);
            bookkeeper.simplePost(year, 'earn', e.source ?? 'IncomeEarned', this.name, e.amount);
        };
        for (const earner of earners) {
            const e = earner.earn(year, bookkeeper);
            if (e && e.amount > 0) {
                post(e);
            }
        }
    }

    withdraw(amount) {
        this.balance -= amount;
        return this.balance;
    }

    spend({ amount, account, year, bookkeeper }) {
        this.withdraw(amount);
        bookkeeper.simplePost(year, 'spend', this.name, account, amount);
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
            source.withdraw(w, bookkeeper, year);
            this.deposit(w);
            bookkeeper.simplePost(year, `${source.constructor.name}Withdrawal`, source.name, this.name, w);
            rv.push({ account: n, amount: w });
            r -= w;
        }
        if (r > 0.005) {
            throw new Error(`insufficient funds shortfall=${r} amount=${amount} accounts=${this.accounts}`);
        }
        return rv;
    }
}
