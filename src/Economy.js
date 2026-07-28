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
        this.sp500Rate = this.cfg.sp500Rate;
    }
}
