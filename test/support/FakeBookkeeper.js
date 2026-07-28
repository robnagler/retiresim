// Minimal Bookkeeper stand-in for unit-testing a single account's
// ledger/tax reporting without wiring up a real Bookkeeper, Config, and
// TaxCalculator.
export class FakeBookkeeper {
    constructor({ magi = 0, economy = {} } = {}) {
        this.ledger = [];
        this.taxCalc = [];
        this.taxCalculator = {
            magi,
            postAmount: (cat, amount, year) => this.taxCalc.push({ cat, amount, year }),
        };
        // colaRate mirrors the real Economy's behavior (derived from
        // inflationRate, not independently configured) unless a test
        // explicitly overrides it to check divergence.
        const inflationRate = economy.inflationRate ?? 0;
        this.economy = { inflationRate, colaRate: inflationRate, interestRate: 0, sp500Rate: 0, ...economy };
    }

    simplePost(year, category, source, dest, amount) {
        this.ledger.push({ year, category, source, dest, amount });
    }
}
