import { Account } from './Account.js';

const MONTHS_PER_YEAR = 12;

export class SocialSecurity extends Account {
    // Reports the raw benefit, not OrdinaryIncome -- how much of it is
    // taxable depends on total provisional income for the year, which
    // only TaxCalculator can compute (see TaxCalculator.taxableSocialSecurity()).
    // No benefit before the claimed startYear -- same null-before-eligible
    // pattern as TraditionalIra.earn()'s age < startAge check.
    earn(year, bookkeeper) {
        if (year < this.cfg.startYear) {
            return null;
        }
        const amount = this.cfg.monthlyAmount * MONTHS_PER_YEAR;
        bookkeeper.taxCalculator?.postAmount('SocialSecurityBenefit', amount, year, bookkeeper);
        return { amount };
    }
}
