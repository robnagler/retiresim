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
* `Mortgage.js` -- balance, rate, `endYear` (payoff year); the monthly payment is derived from those three via the standard fixed-payment amortization formula (not a separate cfg input), fixed once on the first year it runs, splits each year's payment into principal/interest. No payment is due once `year > endYear`. Optional `sellYear`: once `year >= sellYear`, payments stop and the remaining balance is wiped to zero in one non-cash journal entry -- sale proceeds/profit aren't modeled, only the liability going away.
* `Salary.js`, `Pension.js`, `SocialSecurity.js`, `LivingExpense.js` -- income/expense sources, each reports its own tax treatment (or none) to `TaxCalculator`. `SocialSecurity` derives `startYear`/`monthlyAmount` from `cfg.birthYear`/`cfg.claimAge`/`cfg.fraMonthlyBenefit` (~8%/year adjustment off age 67), gating on the derived `startYear` (no benefit posted before the claimed year); `Salary` gates on `cfg.endYear` (no income posted after the working years end).
* `Medicare.js` -- Part B/D premiums and a Medigap Plan G premium (all monthly cfg inputs, annualized internally), plus the IRMAA surcharge on Part B/D looked up from `bookkeeper.taxCalculator.magi` against a fixed internal bracket table (not configurable, not inflation-indexed)

Orchestration (this diverged from the original `Household.js`/`Ledger.js` split -- their responsibilities ended up folded into `Config`, `Cash`, and `Bookkeeper` instead):

* `Config.js` -- reads static/json config, resolves per-account settings (age, salary trajectory, retirement date, SS claiming age/amount live here)
* `Bookkeeper.js` -- builds accounts from config, owns the journal (`JournalEntry`/`Posting`), drives `runYear()` across all accounts, runs the reconciliation check (`_reconcile()`), and reports a year's transactions/balances (`reportTransactions()`, `reportYear()`)
* `Cash.js` -- the year's cash orchestrator: collects income (`earn()`), pays spenders in order (`runYear()`), then covers shortfalls by withdrawing from accounts in `withdrawalOrder` (`produce()`) -- `produce()` runs before spenders' `prepareNextYear()` so a shortfall-covering withdrawal's realized gains/income are taxed the same year they're realized, not dropped. `produce()` caps withdrawals from ordinary-income accounts (`TraditionalIra`/`NonSpousalInheritedIra`) at `cfg.ordinaryIncomeCeiling` when set, falling through to the next account in `withdrawalOrder` for the remainder. Throws `InsufficientFundsError` (`src/InsufficientFundsError.js`, carries `year`) when no account can cover the rest of the shortfall
* `Simulator.js` -- thin year-by-year loop calling `bookkeeper.runYear(year)`, with an optional per-year callback (`run(onYear)`)
* `main.js` -- always runs the optimizer (`node src/main.js [--debug] [path/to/config.json]`, otherwise runs an illustrative built-in scenario): for every entry in `OPTIMIZE_VARIABLES` (currently SS claim age, withdrawal ordinary-income ceiling -- Salary end year and Mortgage sell year are implemented but set by hand instead, see Optimizer Build Plan), prints a candidate/net-worth table via `Optimizer.run()` + `Bookkeeper.netWorth()`; `--debug` additionally prints the full per-year `reportYear()` report for each variable's winning candidate (omitted by default -- one variable's full report is a lot of output, all of them by default would be too much). If every candidate ties, only one candidate is legal, or every candidate ran out of money, the table collapses to one flagged line instead of printing a table that looks like a real tradeoff was searched when none was found. A candidate that throws `InsufficientFundsError` is caught, scored 0, and displayed as `0 (YYYY)` (the year it ran out) instead of aborting the whole grid -- the rest of that variable's candidates, and every other variable, still run

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
+ Cash
- Remaining mortgage balances
```

Cash was added after the original formula: it's real, spendable money, and
excluding it made any decision variable whose only effect was "leaves more
cash unspent" falsely look like it had no effect on net worth at all (first
caught via the Salary end year table going flat in a config where income
already covered spending regardless of Salary's length).

## Optimize Variables

- Social Security claiming age -- when to start benefits. Model the
  amount at full retirement age (e.g. $4,152/month, the current max,
  at 67), then apply the standard ~8%/year adjustment for claiming
  earlier or later.
- Mortgage sell year -- selling the house stops payments and wipes the
  remaining balance off the books; sale proceeds/profit aren't modeled.
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

**Step 3 -- wire it end-to-end for Salary end year** -- **done**. `main.js`
builds an `evaluate(candidateEndYear)` closure that `structuredClone`s the
base config data, overrides the `Salary` entry's `endYear`, runs the
normal `Config` -> `Bookkeeper` -> `Simulator` sequence, and returns
`bookkeeper.netWorth()`; `Optimizer.run()` searches `startYear` through
`startYear + 40` and prints a candidate/net-worth table. An integration
test with a hand-computable optimum (Salary's amount exactly matches
LivingExpense, so more Salary years strictly preserves more
TaxableAccount balance) proves the real pipeline is wired correctly, not
just `Optimizer`'s internal argmax. Confirmed on the real scenario that
the optimum isn't always the latest candidate once taxes/IRMAA are in
play -- a genuine tradeoff, not just "work forever." **Since removed from
`OPTIMIZE_VARIABLES`** by user request -- `Salary.endYear` still works
exactly as built, the user just sets it by hand in `config/cfg.json`
rather than having it auto-searched.

**Social Security claiming age** -- **done**. `SocialSecurity.js` now takes
`birthYear`/`claimAge`/`fraMonthlyBenefit`, deriving `startYear`
(`birthYear + claimAge`) and `monthlyAmount` (`fraMonthlyBenefit` adjusted
~8%/year for claiming before/after age 67) in the constructor, replacing
the old independently-entered `monthlyAmount`/`startYear` fields.
`claimAge` outside 62-70 throws. `SocialSecurity.claimAgeCandidates({
birthYear, asOfYear })` clamps the low end up to `asOfYear - birthYear` --
claim ages already passed as of `Simulator.startYear` aren't real,
actionable choices, so they're excluded rather than offered as candidates
(clamps the high end at 70 too, so someone already past 70 still gets one
candidate: claim now). Wired into `main.js`'s `OPTIMIZE_VARIABLES` list
alongside Salary end year via the same `Optimizer`/`netWorth()` recipe as
Step 3; an integration test in `test/Optimizer.test.js` proves the wiring
with a hand-computable optimum (claiming later than the simulation's
start year costs net worth in that scenario). A 2-year `Simulator` window
can't show delayed-claiming's payoff (it plays out over decades), so
`config/cfg.json`'s `Simulator.endYear` was extended from 2027 to 2051
(birthYear + age 90, matching the Current Objective's horizon) -- on that
realistic horizon the real config's optimum is claim age 69, not an
endpoint, a genuine tradeoff rather than "claim as early/late as
possible."

**`main.js` runs every variable by default, no flag needed** -- **done**.
`node src/main.js [config.json]` loops `OPTIMIZE_VARIABLES` and prints a
candidate/net-worth table per variable (the earlier `--optimize`/
`--optimize-ss` flags and the separate no-flag single-scenario report mode
are gone -- optimizing is now the only thing `main.js` does).
`node src/main.js --debug [config.json]` additionally prints the full
per-year `reportYear()` report for each variable's winning candidate --
gated behind the flag since printing it for every variable by default
would be too much output to scan.

**Withdrawal ordinary-income ceiling** -- **done** (first slice of
"withdrawal source/order," the largest of the five variables). Rather than
a full per-year combinatorial search over which account(s) to draw from,
this is deliberately the simplest structure that lets a shortfall span
multiple accounts in one year: `Cash.produce()` (`src/Cash.js`) caps
withdrawals from `TraditionalIra`/`NonSpousalInheritedIra` at one config
number, `cfg.ordinaryIncomeCeiling` (reading that year's already-posted
`OrdinaryIncome` from Salary/Pension/RMDs, since `cash.earn()` runs before
`produce()` -- see `Bookkeeper.runYear()`), then falls through to the next
account in `withdrawalOrder` (Roth/HSA, no tax consequence) for the
remainder -- no new control flow, the existing walk-the-list loop just
stops early on a capped account. Unset means no cap (today's drain-fully
behavior), so every existing config/test is unaffected. Deliberately
ignores the knock-on effect of ordinary income on Social Security's
taxability (the "tax torpedo") -- a real refinement, not needed for this
first cut. Wired into `main.js`'s `OPTIMIZE_VARIABLES`: candidates are the
federal bracket boundaries themselves plus "no cap" (the interesting
choices are "fill up to the top of this bracket," not arbitrary dollar
amounts). An integration test in `test/Optimizer.test.js` proves the real
pipeline with a hand-computable case: capping withdrawals away from
`TraditionalIra` onto tax-free `RothIra` avoids realizing tax that a
higher ceiling would have to pay (and then withdraw more to cover) the
following year.

**Mortgage sell year** -- **done**, replaces "extra mortgage principal
payments" in Optimize Variables (dropped, not deferred -- the user chose
sell year instead). `Mortgage.js`'s `runYear()` checks `cfg.sellYear`
before the existing `endYear` guard: once `year >= sellYear`, no more
payments are due and the remaining balance is wiped to zero via one
non-cash journal entry (`'mortgageSale'`/`'MortgageBalanceForgiven'`,
distinct from the cash-flow `MortgagePayment` category), guarded by
`balance !== 0` so the forgiveness only posts once. Sale proceeds/profit
are deliberately not modeled -- explicit user instruction. Payments before
`sellYear` are unaffected -- the amortization schedule still targets the
original `endYear`, you just stop following it partway through and the
rest disappears. **Not** wired into `main.js`'s `OPTIMIZE_VARIABLES` --
since no cost of selling is modeled, selling immediately is essentially
always at least as good as waiting (confirmed on the demo scenario: net
worth strictly decreases the longer the sale is delayed), so searching it
wouldn't be a meaningful tradeoff anyway. The user sets `sellYear` by hand
per mortgage in `config/cfg.json` instead.

**Deferred, same two-part recipe once Step 3 lands** (add the model
capability, then its candidate-generation/override glue -- `Optimizer.js`
itself needs no changes):

- HSA-pays-Medicare -- every spender's `due()` is funded generically from
  the shared `Cash` pool via `Cash.produce()`'s `withdrawalOrder` walk;
  routing one specific expense to one specific account needs a deliberate
  extension to that flow.
- A ceiling that varies year-to-year, instead of one fixed number for the
  whole simulation -- the actually-useful version of withdrawal-order
  optimization, since income mix changes over decades, but a much bigger
  search space than a single scalar; a follow-up slice, not part of this
  one.

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
