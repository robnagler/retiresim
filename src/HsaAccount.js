import { RothIra } from './RothIra.js';

// Treated identically to RothIra for this analysis: tax-free withdrawals.
// Ignores HSA-specific rules (qualified-medical-expense requirement,
// ordinary income + penalty on non-qualified withdrawals before 65)
// since they're out of scope here.
export class HsaAccount extends RothIra {
    // Real-world: HSA money should be spent down for medical expenses
    // over life, not left to accumulate -- and there will be real medical
    // costs beyond just Medicare, so this stands in for "other medical
    // expenses" generally rather than being tied to any one spender.
    // Replaces RothIra's plain cfg.withdraw fixed-dollar config entirely
    // for this class: the level annual withdrawal is instead derived,
    // once, from cfg.zeroBalanceYear and the account's own growth rate
    // via the standard fixed-payment amortization formula -- the same
    // approach Mortgage.js uses for its payment (mirroring
    // Mortgage._ensurePayment()'s (cfg.endYear - year + 1) shape exactly,
    // zeroBalanceYear playing the same role endYear does), just inverted
    // (a growing balance being drawn down instead of a loan being paid
    // down). Computed once and held fixed for the rest of the account's
    // life, like Mortgage's payment.
    _ensureDrawdown(year, bookkeeper) {
        if (this.drawdown !== undefined) {
            return;
        }
        const years = this.cfg.zeroBalanceYear - year + 1;
        if (years <= 0) {
            throw new Error(`zeroBalanceYear=${this.cfg.zeroBalanceYear} not after year=${year} ${this}`);
        }
        const r = this.growthRate(bookkeeper);
        // earn() withdraws before this year's growth is applied (Cash.earn()
        // runs before Account.runYear() in Bookkeeper.runYear()'s order), so
        // this is the "annuity due" variant, not Mortgage.js's ordinary-
        // annuity formula -- withdrawing at the START of each year, not the
        // end, changes which power of (1+r) belongs where.
        this.drawdown = r === 0 ? this.balance / years : (this.balance * r * (1 + r) ** (years - 1)) / ((1 + r) ** years - 1);
    }

    // No payment due once year > cfg.zeroBalanceYear -- same guard shape as
    // Mortgage.runYear()'s endYear check, so the drawdown doesn't keep
    // being withdrawn forever once the balance has reached zero.
    earn(year, bookkeeper) {
        this._ensureDrawdown(year, bookkeeper);
        if (year > this.cfg.zeroBalanceYear) {
            return null;
        }
        const amount = Math.min(this.drawdown, this.balance);
        if (amount <= 0) {
            return null;
        }
        this.withdraw(amount);
        return { amount, source: this.name };
    }
}
