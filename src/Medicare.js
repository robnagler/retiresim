import { Account } from './Account.js';

const MONTHS_PER_YEAR = 12;

// Illustrative single-filer IRMAA tiers (rounded), fixed for all years of
// the simulation -- real thresholds/surcharges are published annually by
// CMS and differ by filing status (single/MFJ/MFS each have their own
// table); this project doesn't model either, the same simplification
// already used for tax brackets/ssProvisionalIncomeThresholds.
const IRMAA_BRACKETS = [
    { upTo: 106000, partB: 0, partD: 0 },
    { upTo: 133000, partB: 900, partD: 170 },
    { upTo: 167000, partB: 2250, partD: 430 },
    { upTo: 200000, partB: 3600, partD: 690 },
    { upTo: 500000, partB: 4950, partD: 950 },
    { upTo: null, partB: 5400, partD: 1050 },
];

export class Medicare extends Account {
    constructor({ name, config }) {
        super({ name, config });
        // partBMonthly/partDMonthly/partGMonthly are all billed monthly (Part
        // B to CMS, Part D/Medigap Plan G to private insurers) -- kept as raw
        // monthly figures here, same as Mortgage.monthlyPayment;
        // partBYearly/partDYearly/partGYearly hold the annualized, inflating
        // amounts runYear() actually uses.
        this.partBMonthly = this.cfg.partBMonthly;
        this.partDMonthly = this.cfg.partDMonthly;
        this.partGMonthly = this.cfg.partGMonthly;
        this.partBYearly = this.partBMonthly * MONTHS_PER_YEAR;
        this.partDYearly = this.partDMonthly * MONTHS_PER_YEAR;
        this.partGYearly = this.partGMonthly * MONTHS_PER_YEAR;
    }

    // IRMAA is a cliff, not a marginal bracket like federal/state/ltcg --
    // crossing a threshold jumps the ENTIRE premium to the next tier's
    // surcharge, it doesn't stack incrementally. IRMAA_BRACKETS always ends
    // with upTo:null, so this always matches.
    irmaaSurcharge(magi) {
        return IRMAA_BRACKETS.find((b) => b.upTo === null || magi <= b.upTo);
    }

    // Base premiums inflate every year like LivingExpense's balance; the
    // IRMAA surcharge itself does not compound -- it's looked up fresh each
    // year from that year's magi. bookkeeper.taxCalculator.magi is already
    // last year's value by the time this runs (TaxCalculator.prepareNextYear
    // updates it later in the same annual cycle, via Cash.runYear), so this
    // naturally gets the same 1-year lag as the tax-payment lag.
    // partGYearly (Medigap) is not run through irmaaSurcharge() -- Medigap
    // premiums aren't income-adjusted, only Part B and Part D are.
    runYear({ year, bookkeeper }) {
        this.partBYearly *= 1 + this.rate;
        this.partDYearly *= 1 + this.rate;
        this.partGYearly *= 1 + this.rate;
        const surcharge = this.irmaaSurcharge(bookkeeper.taxCalculator.magi);
        this.owed = this.partBYearly + this.partDYearly + this.partGYearly + surcharge.partB + surcharge.partD;
    }

    due() {
        return { account: 'MedicarePremium', amount: this.owed };
    }
}
