import { Account } from './Account.js';
import { TraditionalIra } from './TraditionalIra.js';
import { InsufficientFundsError } from './InsufficientFundsError.js';

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

    // Caps withdrawals from ordinary-income accounts (TraditionalIra and
    // its NonSpousalInheritedIra subclass) at cfg.ordinaryIncomeCeiling,
    // reading this year's already-posted OrdinaryIncome (Salary/Pension/
    // RMDs, posted by cash.earn() before produce() runs -- see
    // Bookkeeper.runYear()'s call order) so the room left already
    // reflects this year's other ordinary income. A capped account still
    // contributes up to that room, then produce()'s loop falls through
    // to the next account in withdrawalOrder for the remainder. Unset
    // (undefined) means no cap -- today's drain-fully behavior, so every
    // existing config/test is unaffected. Ignores the knock-on effect of
    // ordinary income on Social Security's taxability (the "tax
    // torpedo") -- a real refinement, not needed for this first cut.
    ordinaryIncomeRoom(source, year, bookkeeper) {
        if (!(source instanceof TraditionalIra) || this.cfg.ordinaryIncomeCeiling == null) {
            return Infinity;
        }
        return Math.max(0, this.cfg.ordinaryIncomeCeiling - bookkeeper.balanceChange('OrdinaryIncome', year));
    }

    produce({ amount, year, bookkeeper }) {
        const rv = [];
        let r = amount;
        for (const { name: n } of this.cfg.withdrawalOrder) {
            if (r <= 0) {
                break;
            }
            const source = this.accounts.find((account) => account.name === n);
            const w = Math.min(r, source.balance, this.ordinaryIncomeRoom(source, year, bookkeeper));
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
            throw new InsufficientFundsError({ shortfall: r, amount, year, accounts: this.accounts });
        }
        return rv;
    }
}
