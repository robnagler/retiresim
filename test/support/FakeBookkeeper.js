// Minimal postIncome()-only stand-in for Bookkeeper, for unit-testing a
// single account's tax reporting without wiring up a real Bookkeeper,
// Config, and TaxCalculator.
export class FakeBookkeeper {
    constructor() {
        this.income = [];
    }

    postIncome(kind, amount, year) {
        this.income.push({ kind, amount, year });
    }
}
