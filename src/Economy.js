import { Base } from './Base.js';

// Shared market/inflation assumptions, read once from cfg.Economy instead
// of every consumer (investment accounts, Cash, LivingExpense, Medicare,
// SocialSecurity) carrying its own independently-configured rate.
// Mortgage.rate is deliberately not here -- it's a fixed loan rate, not a
// market/inflation assumption.
export class Economy extends Base {
    constructor({ config }) {
        super({ config });
        this.inflationRate = this.cfg.inflationRate;
        this.colaRate = this.cfg.colaRate;
        this.interestRate = this.cfg.interestRate;
        this.sp500Rate = this.cfg.sp500Rate;
    }
}
