import { Base } from './Base.js';

// Shared market/inflation assumptions, read once from cfg.Economy instead
// of every consumer (investment accounts, Cash, LivingExpense, Medicare,
// SocialSecurity) carrying its own independently-configured rate.
// Mortgage.rate is deliberately not here -- it's a fixed loan rate, not a
// market/inflation assumption. colaRate is not read from cfg -- it's set
// internally from inflationRate, hidden from clients (SocialSecurity.js
// still reads bookkeeper.economy.colaRate, unaware that it's just
// inflationRate under the hood) so cfg.Economy doesn't need a colaRate
// entry of its own. If a scenario ever needs COLA and general inflation to
// diverge, that's the one place to change -- give colaRate its own cfg
// input here instead of deriving it, not a reason to touch any client.
export class Economy extends Base {
    constructor({ config }) {
        super({ config });
        this.inflationRate = this.cfg.inflationRate;
        this.colaRate = this.inflationRate;
        this.interestRate = this.cfg.interestRate;
        this._baseSp500Rate = this.cfg.sp500Rate;
        // Set by Bookkeeper.runYear() every year, so sp500Rate (below) can
        // look up this year's sampled historical return without every
        // caller (Account.growthRate(), HsaAccount's drawdown calc) having
        // to thread a year argument through -- they already just read
        // bookkeeper.economy.sp500Rate as a plain property. null outside
        // a running simulation (e.g. tests constructing Economy directly).
        this.currentYear = null;
        // Map<year, rate>, set once per trial by RobustnessValidator via
        // setHistoricalReturns() (see HistoricalReturns.js's
        // buildReturnSequence()) -- null (the default, every
        // non-robustness run) means sp500Rate behaves exactly as before
        // this existed: the plain configured nominal rate, every year.
        this.historicalReturns = null;
    }

    setHistoricalReturns(historicalReturns) {
        this.historicalReturns = historicalReturns;
    }

    get sp500Rate() {
        return this.historicalReturns?.get(this.currentYear) ?? this._baseSp500Rate;
    }

    // The assumed long-run nominal rate, ignoring whatever this specific
    // year's sampled historical return says -- for a one-time planning
    // calculation (e.g. HsaAccount's amortized drawdown, computed once
    // and held fixed for the account's whole life) that would otherwise
    // be wrong to lock in off a single sampled year's anomalous return
    // for decades.
    get baseSp500Rate() {
        return this._baseSp500Rate;
    }
}
