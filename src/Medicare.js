import { Account } from './Account.js';

export class Medicare extends Account {
    constructor({ name, config }) {
        super({ name, config });
        this.partBBase = this.cfg.partBBase;
        this.partDBase = this.cfg.partDBase;
    }

    // IRMAA is a cliff, not a marginal bracket like federal/state/ltcg --
    // crossing a threshold jumps the ENTIRE premium to the next tier's
    // surcharge, it doesn't stack incrementally. Brackets are static across
    // the simulation, the same simplification already used for tax
    // brackets/ssProvisionalIncomeThresholds (no inflation-indexing of the
    // thresholds themselves is modeled).
    irmaaSurcharge(magi) {
        for (const b of this.cfg.irmaaBrackets) {
            if (b.upTo === null || magi <= b.upTo) {
                return b;
            }
        }
        throw new Error(`no irmaaBrackets matched magi=${magi} ${this}`);
    }

    // Base premiums inflate every year like LivingExpense's balance; the
    // IRMAA surcharge itself does not compound -- it's looked up fresh each
    // year from that year's magi. bookkeeper.taxCalculator.magi is already
    // last year's value by the time this runs (TaxCalculator.prepareNextYear
    // updates it later in the same annual cycle, via Cash.runYear), so this
    // naturally gets the same 1-year lag as the tax-payment lag.
    runYear({ year, bookkeeper }) {
        this.partBBase *= 1 + this.rate;
        this.partDBase *= 1 + this.rate;
        const surcharge = this.irmaaSurcharge(bookkeeper.taxCalculator.magi);
        this.owed = this.partBBase + this.partDBase + surcharge.partB + surcharge.partD;
    }

    due() {
        return { account: 'MedicarePremium', amount: this.owed };
    }
}
