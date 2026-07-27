// Thrown by Cash.produce() when withdrawalOrder can't cover a year's
// shortfall. Carries `year` as a structured field (not just embedded in
// the message) so callers like main.js's optimizer sweep can catch this
// specific failure and keep going, without resorting to string-parsing
// the message or accidentally swallowing unrelated errors.
export class InsufficientFundsError extends Error {
    constructor({ shortfall, amount, year, accounts }) {
        super(`insufficient funds shortfall=${shortfall} amount=${amount} year=${year} accounts=${accounts}`);
        this.year = year;
    }
}
