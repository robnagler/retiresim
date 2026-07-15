# Retirement Optimizer Project Brief

## TODO

- Initial magi state tax hsa talks to Medicare
- update this plan
- priorYearMagi -> initialMagi, and magi (tax calcs are last years always)


## Goal

Develop a Javascript retirement simulator and optimizer that produces
a financially correct year-by-year simulation and then optimizes
retirement decisions.

Financial correctness takes priority over optimization.


---

## Overview

Simple javascript with classes for each object, likely one per
file. Unit tests for each class. Configuration read from a json file
stored but never committed in static/json (add gitignore). the unit
tests should be runnable by node locally. I don't want a lot of
infrastructure.

The tests will go in test. One test per class.

Build the project slowly one module at a time.

---

## Modularization

Core state, one class per file:

* `Account.js` -- base class: balance, `grow(rate)`, `deposit()`, `withdraw()`
* `TaxableAccount.js` extends Account -- adds basis tracking
* `TraditionalIra.js`, `RothIra.js`, `InheritedIra.js` extend Account -- each encodes its own RMD/withdrawal rules
* `HsaAccount.js` extends Account
* `Mortgage.js` -- balance, rate, amortization schedule, splits a payment into principal/interest

Orchestration:

* `Household.js` -- age, salary trajectory, retirement date, SS claiming age/amount
* `Ledger.js` -- builds one year's ledger record (beginning/ending balances, investment activity, income, expenses) and runs the reconciliation check
* `Simulator.js` -- drives the year-by-year loop, calling into everything else

Taxes (start as a single class, split only if it gets unwieldy):

* `TaxCalculator.js` -- federal, Colorado, LTCG, qualified dividends, SS taxation, IRMAA, mortgage interest deduction

### Build Order

1. `Account` + subclasses, unit-tested for growth/deposit/withdraw in isolation
2. `Mortgage`, unit-tested for amortization alone
3. `Ledger` structure + reconciliation check, fed with hand-built fake numbers (no Simulator yet)
4. `Simulator` skeleton wired to Accounts + Mortgage + Ledger for a pure-growth, no-income, no-tax scenario -- first end-to-end reconciliation pass
5. Add income sources (salary, SS, RMD) into the Simulator loop
6. Add `TaxCalculator`, starting with federal + Colorado only, then layer in LTCG/QDI/SS-taxation/IRMAA/mortgage deduction one at a time
7. Wire withdrawals to actually cover expenses/taxes, still with a fixed deterministic withdrawal order
8. Optimizer as its own module last, once step 7 reconciles cleanly every year

## Current Objective

Maximize net worth at age 90:

```
Taxable
+ Traditional IRA
+ Roth IRA
+ Inherited IRA
+ HSA
- Remaining mortgage balances
```

---

## Spending Assumptions

Living expenses:

* Inflation adjusted (currently 2.5% annually)

Mortgage payments:

* Paid from modeled cash flow
* NOT included in the living expenses
* Principal and interest are additional required annual expenses

Taxes are also paid from modeled cash flow.

---

## Income Sources

The model may receive cash from:

* Employment income
* Social Security
* Required Minimum Distributions
* Traditional IRA withdrawals
* Roth withdrawals
* Qualified dividends
* Taxable account sales

---

## Accounts

Track independently:

* Taxable brokerage
* Taxable basis
* Traditional IRA
* Roth IRA
* Inherited IRA
* HSA

---

## Taxes

Model:

* Federal income tax
* Colorado income tax
* Long-term capital gains
* Qualified dividends
* Social Security taxation
* RMDs
* IRMAA
* Mortgage interest deduction (if applicable)

---

## Annual Ledger

For every simulated year print:

### Beginning balances

* Taxable
* Basis
* Traditional IRA
* Roth IRA
* Inherited IRA
* HSA

### Investment activity

For each account:

* Beginning balance
* Investment growth
* Dividends/interest
* Ending before withdrawals

### Income

* Salary
* Social Security
* RMD
* Traditional IRA withdrawals
* Roth withdrawals
* Qualified dividends
* Taxable sales

### Expenses

* Living expenses
* Mortgage interest
* Mortgage principal
* Federal tax
* Colorado tax
* One-time mortgage paydowns (if enabled)

### Ending balances

Print every account.

---

## Required Reconciliation

Every year must satisfy:

```
Beginning assets
+ investment growth
+ income
- withdrawals
- expenses
= ending assets
```

Cash reconciliation must equal zero (within one cent).

---

## Automatic Validation

Every simulated year should verify:

* Cash balances reconcile.
* Account balances reconcile.
* Taxable basis never exceeds taxable account value.
* No account becomes negative unless explicitly allowed.
* Mortgage balances amortize correctly.

Abort immediately if any check fails.

---
