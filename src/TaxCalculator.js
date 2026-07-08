import { Base } from './Base.js';

export class TaxCalculator extends Base {
    constructor({ config }) {
        super();
        this.cfg = config.get(this.constructor.name);
        this.owed = this.cfg.startingTax;
    }

    federal(income) {
        let rv = 0;
        let p = 0;
        for (const c of this.cfg.federalBrackets) {
            const u = c.upTo === null ? income : Math.min(income, c.upTo);
            if (u <= p) {
                break;
            }
            rv += (u - p) * c.rate;
            p = u;
        }
        return rv;
    }

    state(income) {
        return income * this.cfg.stateRate;
    }

    calculate(income) {
        const rv = { federal: this.federal(income), state: this.state(income) };
        rv.total = rv.federal + rv.state;
        return rv;
    }

    settle(income) {
        const d = this.owed;
        this.owed = this.calculate(income).total;
        return d;
    }
}
