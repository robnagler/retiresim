# Financial Planner Project Brief

## Goal

Develop a Javascript financial planning simulator and optimizer that produces
a financially correct year-by-year simulation and then optimizes
financial decisions.

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

* `Base.js` -- root class every other class extends: resolves `name`/`cfg` from `Config`, and a `toString()` that dumps all fields for error messages
* `Account.js` extends `Base` -- balance, `grow(rate)`, `deposit()`, `withdraw()`
* `TaxableAccount.js` extends Account -- adds basis tracking
* `TraditionalIra.js`, `RothIra.js`, `NonSpousalInheritedIra.js` extend Account -- each encodes its own RMD/withdrawal rules
* `HsaAccount.js` extends `RothIra` -- no tax consequence on withdrawal, same as Roth
* `Mortgage.js` -- balance, rate, `endYear` (payoff year); the monthly payment is derived from those three via the standard fixed-payment amortization formula (not a separate cfg input), fixed once on the first year it runs, splits each year's payment into principal/interest. No payment is due once `year > endYear`.
* `Salary.js`, `Pension.js`, `SocialSecurity.js`, `LivingExpense.js` -- income/expense sources, each reports its own tax treatment (or none) to `TaxCalculator`. `SocialSecurity` gates on `cfg.startYear` (no benefit posted before the claimed year); `Salary` gates on `cfg.endYear` (no income posted after the working years end).
* `Medicare.js` -- Part B/D premiums and a Medigap Plan G premium (all monthly cfg inputs, annualized internally), plus the IRMAA surcharge on Part B/D looked up from `bookkeeper.taxCalculator.magi` against a fixed internal bracket table (not configurable, not inflation-indexed)

Orchestration (this diverged from the original `Household.js`/`Ledger.js` split -- their responsibilities ended up folded into `Config`, `Cash`, and `Bookkeeper` instead):

* `Config.js` -- reads static/json config, resolves per-account settings (age, salary trajectory, retirement date, SS claiming age/amount live here)
* `Bookkeeper.js` -- builds accounts from config, owns the journal (`JournalEntry`/`Posting`), drives `runYear()` across all accounts, runs the reconciliation check (`_reconcile()`), and reports a year's transactions/balances (`reportTransactions()`, `reportYear()`)
* `Cash.js` -- the year's cash orchestrator: collects income (`earn()`), pays spenders in order (`runYear()`), then covers shortfalls by withdrawing from accounts in `withdrawalOrder` (`produce()`) -- `produce()` runs before spenders' `prepareNextYear()` so a shortfall-covering withdrawal's realized gains/income are taxed the same year they're realized, not dropped
* `Simulator.js` -- thin year-by-year loop calling `bookkeeper.runYear(year)`, with an optional per-year callback (`run(onYear)`)
* `main.js` -- runs the simulation and prints each year's report; takes an optional config file path as its first CLI argument (`node src/main.js path/to/config.json`), otherwise runs an illustrative built-in scenario

Taxes (single class, as planned -- has not needed splitting):

* `TaxCalculator.js` -- federal, Colorado, LTCG, SS taxation, mortgage interest deduction, MAGI tracking for IRMAA. Qualified dividends are intentionally out of scope (not deferred) -- see below.

Each account/income source reports its own tax treatment directly via `bookkeeper.taxCalculator.postAmount(cat, amount, year, bookkeeper)` rather than `TaxCalculator` inspecting account types itself.

### Build Order

1. `Account` + subclasses, unit-tested for growth/deposit/withdraw in isolation -- **done**
2. `Mortgage`, unit-tested for amortization alone -- **done**
3. `Bookkeeper`'s journal + reconciliation check, fed with hand-built fake numbers (no Simulator yet) -- **done**
4. `Simulator` skeleton wired to Accounts + Mortgage + Bookkeeper for a pure-growth, no-income, no-tax scenario -- first end-to-end reconciliation pass -- **done**
5. Add income sources (salary, SS, RMD) into the Simulator loop -- **done**
6. Add `TaxCalculator`: federal, Colorado, LTCG, SS taxation, mortgage interest deduction -- **done**. IRMAA (`TaxCalculator.magi`, seeded from `cfg.initialMagi`) is now consumed by `Medicare.js` -- **done**.
7. Wire withdrawals to actually cover expenses/taxes, still with a fixed deterministic withdrawal order -- **done** (`Cash.produce()`). Fixed a real bug where `TaxCalculator.prepareNextYear()` ran before `produce()`, so gains/income from a shortfall-covering withdrawal were silently dropped from that year's tax calculation instead of taxed -- `_reconcile()` couldn't catch this since each account's own balance still reconciled correctly.
8. Optimizer as its own module last, once step 7 reconciles cleanly every year -- **not started**

### Current Plan / Next Steps

* Optimizer module (build order step 8) -- the only thing left

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

## Optimize Variables

- Social Security claiming age -- when to start benefits. Model the
  amount at full retirement age (e.g. $4,152/month, the current max,
  at 67), then apply the standard ~8%/year adjustment for claiming
  earlier or later.
- Extra mortgage principal payments -- how much, if any, to pay down
  beyond the required payment.
- HSA usage -- whether to pay Medicare premiums from the HSA.
- Withdrawal source -- Taxable vs. Roth IRA vs. Traditional IRA,
  potentially varying year to year based on Social Security and
  salary income.
- Salary end year -- when to stop working (e.g. age 75), since
  retiring later changes the outcome.

## Optimizer Build Plan

The five variables above vary hugely in build cost. Rather than modeling
all five before any optimizer exists, build one thin, fully-working
pipeline (search harness + scoring + tests) around the cheapest variable
first, prove it end-to-end, then repeat the same recipe for the rest one
at a time.

**Step 1 -- `Salary.endYear`** -- **done**. Gates `Salary.earn()` on
`year > cfg.endYear` returning `null`, mirroring `SocialSecurity.earn()`'s
`year < cfg.startYear` gate. `endYear` added to every `Salary` cfg block
(`main.js`'s `DEFAULT_CONFIG_DATA`, `config/cfg.json`, test fixtures).
`test/Salary.test.js` added, following `test/SocialSecurity.test.js`'s shape.

**Step 2 -- generic `Optimizer.js`** -- **done**. A tiny brute-force search
that knows nothing about `Config`/`Bookkeeper`/`Simulator`/`netWorth` --
just `run(candidates, evaluate)` returning the best `{candidate, score}`
plus all results, so it stays reusable for every future variable (and
later, combinations) without changes. Unit-tested with fake `evaluate`
functions, including a non-monotonic case proving it isn't just taking an
endpoint.

**Step 3 -- wire it end-to-end for Salary end year** -- **done**. `main.js
--optimize [config.json]` builds an `evaluate(candidateEndYear)` closure
that `structuredClone`s the base config data, overrides the `Salary`
entry's `endYear`, runs the normal `Config` -> `Bookkeeper` -> `Simulator`
sequence, and returns `bookkeeper.netWorth()`; `Optimizer.run()` searches
`startYear` through `startYear + 40` and prints the winner. The
single-scenario report (no flag) is untouched. An integration test with a
hand-computable optimum (Salary's amount exactly matches LivingExpense, so
more Salary years strictly preserves more TaxableAccount balance) proves
the real pipeline is wired correctly, not just `Optimizer`'s internal
argmax. Confirmed on the real scenario that the optimum isn't always the
latest candidate once taxes/IRMAA are in play -- a genuine tradeoff, not
just "work forever."

**Deferred, same two-part recipe once Step 3 lands** (add the model
capability, then its candidate-generation/override glue -- `Optimizer.js`
itself needs no changes):

- Social Security claiming age -- needs a claim-age-driven benefit
  formula (derive `monthlyAmount`/`startYear` from one `claimAge` input),
  replacing today's two independent, manually-entered fields.
- Extra mortgage principal payments -- `Mortgage.runYear()` currently
  detects payoff only via `year > cfg.endYear`; extra principal means
  payoff can happen early, so detection also needs `balance >= 0`.
- HSA-pays-Medicare -- every spender's `due()` is funded generically from
  the shared `Cash` pool via `Cash.produce()`'s `withdrawalOrder` walk;
  routing one specific expense to one specific account needs a deliberate
  extension to that flow.
- Withdrawal source/order varying by year -- the largest of the five;
  `Cash.withdrawalOrder` is a single static list applied identically every
  year (see `README.md`'s note that this is "deferred to the future
  Optimizer module").

Also noted, not part of this plan: CLAUDE.md's Overview section still
says config lives in `static/json`, which never existed on disk -- the
real path is `config/cfg.json` (gitignored via `config/.gitignore`).

---

## Spending Assumptions

Living expenses:

* Inflation adjusted (currently 2.5% annually)

Mortgage payments:

* Paid from modeled cash flow
* NOT included in the living expenses
* Principal and interest are additional required annual expenses

Medicare premiums:

* Part B, Part D, and Medigap Plan G, paid from modeled cash flow, NOT included in living expenses
* Part B/D carry an IRMAA surcharge based on prior-year MAGI; Medigap does not

Taxes are also paid from modeled cash flow.

---

## Income Sources

The model may receive cash from:

* Employment income
* Social Security
* Required Minimum Distributions
* Traditional IRA withdrawals
* Roth withdrawals
* Taxable account sales

(Qualified dividends are intentionally out of scope -- see Taxes below.)

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

* Federal income tax -- done
* Colorado income tax -- done (no preferential LTCG rate at the state level; SS benefits excluded entirely, current CO law for 65+)
* Long-term capital gains -- done
* Social Security taxation -- done (IRS provisional-income worksheet)
* RMDs -- done
* IRMAA -- done (`Medicare.js` looks up the Part B/D surcharge from `TaxCalculator.magi`, a 1-year-lag approximation of IRMAA's real 2-year lookback; thresholds differ by filing status in reality, so this implicitly represents one filing status's numbers, same as `standardDeduction`)
* Mortgage interest deduction (if applicable) -- done

Qualified dividends are intentionally **out of scope**, not deferred -- a small, hard-to-estimate perturbation for this portfolio (mostly mutual funds), not worth the modeling complexity.

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
