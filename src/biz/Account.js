import { Base } from './Base.js';

export class Account extends Base {
    constructor({ name, config }) {
        super({ name, config });
        this.balance = this.cfg.balance;
    }

    earn(year) {
        return null;
    }

    grow(rate) {
        this.balance += this.balance * rate;
        return this.balance;
    }

    deposit(amount) {
        this.balance += amount;
        return this.balance;
    }

    withdraw(amount) {
        const checkSufficient = () => {
            if (amount <= this.balance) {
                return;
            }
            throw new Error(`amount=${amount} ${this}`);
        };
        checkSufficient();
        this.balance -= amount;
        return this.balance;
    }

    // Defaults to the shared market-growth rate for investment accounts
    // (TaxableAccount/TraditionalIra/RothIra/HsaAccount/
    // NonSpousalInheritedIra all inherit this unmodified); LivingExpense
    // overrides it to inflationRate instead (see LivingExpense.js).
    // Mortgage/Cash/Medicare/SocialSecurity override runYear() entirely
    // and never call this.
    growthRate(bookkeeper) {
        return bookkeeper.economy.sp500Rate;
    }

    runYear({ year, bookkeeper }) {
        const a = this.balance;
        this.grow(this.growthRate(bookkeeper));
        bookkeeper.simplePost(year, 'growth', 'UnrealizedGrowth', this.name, this.balance - a);
    }
}
