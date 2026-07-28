import { Account } from './Account.js';
import { TraditionalIra } from './TraditionalIra.js';
import { TaxableAccount } from './TaxableAccount.js';
import { InsufficientFundsError } from './InsufficientFundsError.js';

// Every withdrawalOrder account falls into exactly one tax category:
// realized capital gains (TaxableAccount), ordinary income (TraditionalIra
// and its NonSpousalInheritedIra subclass), or no tax consequence at all
// (everything else -- RothIra/HsaAccount). Order matters: TaxableAccount
// isn't a TraditionalIra, so this is safe as a plain if-chain.
function categoryOf(account) {
    if (account instanceof TaxableAccount) {
        return 'ltcg';
    }
    if (account instanceof TraditionalIra) {
        return 'income';
    }
    return 'taxFree';
}

export class Cash extends Account {
    constructor({ name, config, accounts, spenders }) {
        super({ name, config });
        this.accounts = accounts;
        this.spenders = spenders;
    }

    // Idle cash earns interest too, same shape as Account.runYear()'s
    // growth posting -- but only half of Economy.interestRate, not the
    // full rate, since it's sitting somewhere lower-yield than invested
    // accounts (a checking/settlement account, not a market position).
    runYear({ year, bookkeeper }) {
        const a = this.balance;
        this.grow(bookkeeper.economy.interestRate * 0.5);
        bookkeeper.simplePost(year, 'growth', 'UnrealizedGrowth', this.name, this.balance - a);
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

    // Caps withdrawals from a category's accounts at that category's
    // ceiling (cfg.ltcgCeiling for TaxableAccount, cfg.incomeCeiling for
    // TraditionalIra/NonSpousalInheritedIra), reading this year's
    // already-posted LtcgIncome/OrdinaryIncome (posted by cash.earn()
    // before produce() runs -- see Bookkeeper.runYear()'s call order) so
    // the room left already reflects this year's other income in that
    // category. This is exactly why an inherited account's already-forced
    // RMD needs no special case: it posted to OrdinaryIncome via earn()
    // before produce() ever runs, so the income category's room already
    // reflects it. taxFree accounts (RothIra/HsaAccount) are never capped
    // -- no tax cost to drawing them. A capped account still contributes
    // up to its room, then produce() falls through to the next account for
    // the remainder. Unset ceilings mean no cap -- today's drain-fully
    // behavior, so every existing config/test is unaffected. Ignores the
    // knock-on effect of ordinary income on Social Security's taxability
    // (the "tax torpedo") -- a real refinement, not needed for this cut.
    //
    // Return value is always in withdrawal-amount terms, not tax-category
    // dollars -- for 'income' those are the same thing (every withdrawn
    // dollar is a dollar of ordinary income), but for 'ltcg' a withdrawal
    // is only partially gain (TaxableAccount.withdraw()'s basis fraction),
    // so the raw gain-room has to be converted back into a withdrawal
    // amount by dividing by that same gain fraction.
    categoryRoom(source, year, bookkeeper) {
        const category = categoryOf(source);
        if (category === 'ltcg') {
            if (this.cfg.ltcgCeiling == null) {
                return Infinity;
            }
            const gainRoom = Math.max(0, this.cfg.ltcgCeiling - bookkeeper.balanceChange('LtcgIncome', year));
            const gainFraction = source.balance > 0 ? 1 - source.basis / source.balance : 0;
            return gainFraction > 0 ? gainRoom / gainFraction : Infinity;
        }
        if (category === 'income') {
            return this.cfg.incomeCeiling == null ? Infinity : Math.max(0, this.cfg.incomeCeiling - bookkeeper.balanceChange('OrdinaryIncome', year));
        }
        return Infinity;
    }

    // Accounts in one category, preserving their relative order from
    // cfg.withdrawalOrder as the within-category sub-order -- that
    // sub-order isn't itself searched by the optimizer, only which
    // category goes first/second/third.
    accountsInCategory(category) {
        return this.cfg.withdrawalOrder
            .map(({ name: n }) => this.accounts.find((account) => account.name === n))
            .filter((account) => categoryOf(account) === category);
    }

    produce({ amount, year, bookkeeper }) {
        const rv = [];
        let r = amount;
        const withdrawFrom = (source) => {
            if (r <= 0) {
                return;
            }
            const w = Math.min(r, source.balance, this.categoryRoom(source, year, bookkeeper));
            if (w <= 0) {
                return;
            }
            source.withdraw(w, bookkeeper, year);
            this.deposit(w);
            bookkeeper.simplePost(year, `${source.constructor.name}Withdrawal`, source.name, this.name, w);
            rv.push({ account: source.name, amount: w });
            r -= w;
        };
        // cfg.categoryOrder walks accounts category-by-category (the
        // optimizer's search axis); unset falls back to cfg.withdrawalOrder
        // literally, as before categories existed, so every existing
        // config/test keeps working unchanged.
        if (this.cfg.categoryOrder) {
            for (const category of this.cfg.categoryOrder) {
                for (const source of this.accountsInCategory(category)) {
                    withdrawFrom(source);
                }
            }
        } else {
            for (const { name: n } of this.cfg.withdrawalOrder) {
                withdrawFrom(this.accounts.find((account) => account.name === n));
            }
        }
        if (r > 0.005) {
            throw new InsufficientFundsError({ shortfall: r, amount, year, accounts: this.accounts });
        }
        return rv;
    }
}
