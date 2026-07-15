// Minimal Bookkeeper stand-in for unit-testing a single account's
// ledger/tax reporting without wiring up a real Bookkeeper, Config, and
// TaxCalculator.
export class FakeBookkeeper {
    constructor({ magi = 0 } = {}) {
        this.ledger = [];
        this.taxCalc = [];
        this.taxCalculator = {
            magi,
            postAmount: (cat, amount, year) => this.taxCalc.push({ cat, amount, year }),
        };
    }

    simplePost(year, category, source, dest, amount) {
        this.ledger.push({ year, category, source, dest, amount });
    }
}
