import { Account } from './Account.js';

export class Cash extends Account {
    constructor({ name, config, accounts, spenders, earners }) {
        super({ name, config });
        this.accounts = accounts;
        this.spenders = spenders;
        this.earners = earners;
    }

    runYear({ year, bookkeeper }) {
        for (const source of this.accounts) {
            if (!source.rmd) {
                continue;
            }
            const amount = source.rmd(year);
            if (amount > 0) {
                this.requiredDistribution({ source, amount, year, bookkeeper });
            }
        }
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
        bookkeeper.simplePost(year, 'earn', 'IncomeEarned', this.name, amount);
        bookkeeper.simplePost(year, 'earn', 'IncomeEarned', account, amount);
    }

    requiredDistribution({ source, amount, year, bookkeeper }) {
        source.withdraw(amount);
        this.deposit(amount);
        bookkeeper.simplePost(year, `${source.constructor.name}Rmd`, source.name, this.name, amount);
        bookkeeper.simplePost(year, `${source.constructor.name}Rmd`, 'IncomeEarned', 'OrdinaryIncome', amount);
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
            source.withdraw(w);
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
