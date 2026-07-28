import { Account } from './Account.js';
import { TraditionalIra } from './TraditionalIra.js';
import { TaxableAccount } from './TaxableAccount.js';
import { HsaAccount } from './HsaAccount.js';
import { InsufficientFundsError } from './InsufficientFundsError.js';

// Every withdrawalOrder account falls into exactly one tax category:
// realized capital gains (TaxableAccount), ordinary income (TraditionalIra
// and its NonSpousalInheritedIra subclass), or no tax consequence at all
// (everything else -- RothIra/HsaAccount). Order matters: TaxableAccount
// isn't a TraditionalIra, so this is safe as a plain if-chain. HsaAccount
// still classifies as 'taxFree' here (categoryRoom()'s ceiling logic is
// never reached for it either way), but produce() never actually withdraws
// from it -- see produce()'s withdrawFrom().
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
        for (const spender of this.spenders) {
            const x = spender.due();
            // payFrom is a tax-efficiency preference (pay this tax-free if
            // possible), not a hard requirement -- payDirect() pays as much
            // as the named account can cover and reports back the rest,
            // which flows through the normal spend()/produce() path just
            // like any other expense instead of throwing when that one
            // account alone can't cover it.
            const remaining = spender.cfg.payFrom
                ? this.payDirect({ amount: x.amount, sourceAccount: spender.cfg.payFrom, destCategory: x.account, year, bookkeeper })
                : x.amount;
            if (remaining > 0) {
                this.spend({ amount: remaining, account: x.account, year, bookkeeper });
            }
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

    // Routes as much of one spender's due() amount as possible straight
    // from a named account to its expense category, bypassing Cash's own
    // balance and produce()'s category capping entirely for that portion --
    // for a spender whose cfg declares payFrom (e.g. Medicare preferring
    // the tax-free HSA over the shared Cash pool). Pays min(amount,
    // source.balance) and returns whatever's left uncovered -- the source
    // account being short is not itself a household shortfall, so this
    // never throws; the caller (runYear()) routes any remainder through the
    // normal spend()/produce() path, same as an expense with no payFrom at
    // all.
    payDirect({ amount, sourceAccount, destCategory, year, bookkeeper }) {
        const source = this.accounts.find((account) => account.name === sourceAccount);
        const fromSource = Math.min(amount, source.balance);
        if (fromSource > 0) {
            source.withdraw(fromSource, bookkeeper, year);
            bookkeeper.simplePost(year, 'spend', source.name, destCategory, fromSource);
        }
        return amount - fromSource;
    }

    // Caps withdrawals from a category's accounts at that category's
    // ceiling, reading this year's already-posted LtcgIncome/OrdinaryIncome
    // (posted by cash.earn() before produce() runs -- see
    // Bookkeeper.runYear()'s call order) so the room left already reflects
    // this year's other income in that category. This is exactly why an
    // inherited account's already-forced RMD needs no special case: it
    // posted to OrdinaryIncome via earn() before produce() ever runs, so
    // the income category's room already reflects it. taxFree accounts
    // (RothIra/HsaAccount) are never capped -- no tax cost to drawing them.
    //
    // The ceiling itself is a bracket INDEX (cfg.ltcgCeilingBracket /
    // cfg.incomeCeilingBracket), not a static dollar amount -- resolved
    // against bookkeeper.taxCalculator's live ltcgBrackets/federalBrackets
    // each time this runs, so the applied dollar ceiling grows every year
    // right along with the real brackets (TaxCalculator.prepareNextYear()
    // already grows both by inflationRate). A ceiling fixed once at
    // Simulator.startYear and never adjusted would mean less and less as
    // the simulation runs for decades. Unset (null/undefined) means no cap.
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
            if (this.cfg.ltcgCeilingBracket == null) {
                return Infinity;
            }
            const ceiling = bookkeeper.taxCalculator.ltcgBrackets[this.cfg.ltcgCeilingBracket].upTo;
            const gainRoom = Math.max(0, ceiling - bookkeeper.balanceChange('LtcgIncome', year));
            const gainFraction = source.balance > 0 ? 1 - source.basis / source.balance : 0;
            return gainFraction > 0 ? gainRoom / gainFraction : Infinity;
        }
        if (category === 'income') {
            if (this.cfg.incomeCeilingBracket == null) {
                return Infinity;
            }
            const ceiling = bookkeeper.taxCalculator.federalBrackets[this.cfg.incomeCeilingBracket].upTo;
            return Math.max(0, ceiling - bookkeeper.balanceChange('OrdinaryIncome', year));
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
        const withdrawFrom = (source, ignoreCeiling) => {
            // HsaAccount is real money only for qualified medical expenses
            // (Medicare here, via a spender's payFrom) -- never a general
            // funding source for mortgage/living-expense/tax shortfalls the
            // way RothIra is, so produce()'s shortfall walk skips it
            // entirely regardless of categoryOrder/withdrawalOrder position
            // or ceiling pass. A cfg.withdraw amount (RothIra.earn()) is
            // still a separate, deliberate planned distribution, untouched
            // by this.
            if (r <= 0 || source instanceof HsaAccount) {
                return;
            }
            const room = ignoreCeiling ? Infinity : this.categoryRoom(source, year, bookkeeper);
            const w = Math.min(r, source.balance, room);
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
        const walk = (ignoreCeiling) => {
            if (this.cfg.categoryOrder) {
                for (const category of this.cfg.categoryOrder) {
                    for (const source of this.accountsInCategory(category)) {
                        withdrawFrom(source, ignoreCeiling);
                    }
                }
            } else {
                for (const { name: n } of this.cfg.withdrawalOrder) {
                    withdrawFrom(this.accounts.find((account) => account.name === n), ignoreCeiling);
                }
            }
        };
        walk(false);
        // Ceilings are a tax-efficiency preference (draw this much before
        // moving on), not a hard limit -- if the capped walk still leaves a
        // shortfall, fall back to the same order with no cap at all, rather
        // than reporting insolvency while money still sits in a capped
        // account. Only accounts still holding a balance after the first
        // pass contribute anything here.
        if (r > 0.005) {
            walk(true);
        }
        if (r > 0.005) {
            throw new InsufficientFundsError({ shortfall: r, amount, year, accounts: this.accounts });
        }
        return rv;
    }
}
