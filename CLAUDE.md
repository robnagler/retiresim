# Financial Planner Project Brief

## TODO
- Introduce random numbers based on a fixed (committed) seed table so
  runs are reproducable. Any random values generated are always in the
  same order at module startup (see crashes below)
- add running random simulations like monte carlo
- Introduce a crash based on a probability but non recurring so would
  start the clock over. The crashes computed at startup. Then all runs
  use the same crashes. The crash affects the rate for that year,
  which can be negative. Base it on historical crashes.

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
* `Economy.js` extends `Base` -- shared market/inflation assumptions read once from `cfg.Economy`: `inflationRate`, `interestRate`, `sp500Rate`. `Bookkeeper` builds one and exposes it as `bookkeeper.economy`, so any class with a `bookkeeper` reference uses the shared rate instead of an independently-configured one of its own. `colaRate` is also exposed, but not read from cfg -- it's derived internally as `this.colaRate = this.inflationRate`, hidden from clients (`SocialSecurity.js` still reads `bookkeeper.economy.colaRate`, unaware it's just `inflationRate`); a future scenario that needs COLA and general inflation to diverge would give `colaRate` its own cfg input here instead. `Mortgage.rate` is deliberately not here -- it's a fixed loan rate, not a market/inflation assumption.
* `Account.js` extends `Base` -- balance, `grow(rate)`, `deposit()`, `withdraw()`, `growthRate(bookkeeper)` (defaults to `bookkeeper.economy.sp500Rate`, overridable -- see `LivingExpense.js`), and `runYear()` (grows the balance at `growthRate()` and posts the change)
* `TaxableAccount.js` extends Account -- adds basis tracking
* `TraditionalIra.js`, `RothIra.js`, `NonSpousalInheritedIra.js` extend Account -- each encodes its own RMD/withdrawal rules
* `HsaAccount.js` extends `RothIra` -- no tax consequence on withdrawal, same as Roth, but replaces `RothIra`'s plain `cfg.withdraw` fixed-dollar config entirely with a computed, scheduled drawdown: HSA money should be spent down for medical expenses over life (standing in for costs beyond just `Medicare`, not tied to any one spender), not left to accumulate. `earn()`'s `_ensureDrawdown()` derives a level annual tax-free withdrawal, once, from `cfg.zeroBalanceYear` and the account's own growth rate (`growthRate(bookkeeper)`, same `sp500Rate` every other investment account uses) via the standard fixed-payment amortization formula -- the same approach `Mortgage.js` uses for its payment (mirroring `Mortgage._ensurePayment()`'s `(cfg.endYear - year + 1)` shape exactly, `zeroBalanceYear` playing the same role `endYear` does), just inverted (a growing balance being drawn down instead of a loan being paid down), and using the annuity-due variant of that formula (withdraw, then grow, matching `Cash.earn()` running before `Account.runYear()`'s growth in `Bookkeeper.runYear()`'s order) rather than `Mortgage.js`'s ordinary-annuity version. Computed once and held fixed for the rest of the account's life, like `Mortgage`'s payment; throws if `cfg.zeroBalanceYear` isn't after the year it's first computed. No withdrawal once `year > cfg.zeroBalanceYear`, same guard shape as `Mortgage.runYear()`'s `endYear` check. `Cash.produce()`'s exclusion of `HsaAccount` from the general withdrawal walk is unaffected -- the scheduled drawdown runs through `earn()`, the same forced-distribution channel RMDs already use, not `produce()`. Does not model a non-spouse-inherited HSA's real death-tax treatment (full balance as ordinary income in one lump sum) -- built once, then explicitly dropped: the resulting liability couldn't correctly reduce net worth anyway given this project's existing 1-year tax-payment lag (nothing pays a liability accrued in the simulation's very last year, since there's no year after it to pay it in, and `TaxCalculator`'s balance is deliberately excluded from `netWorth()`), and it was largely redundant with the scheduled drawdown besides
* `Mortgage.js` -- balance, rate, `endYear` (payoff year); the monthly payment is derived from those three via the standard fixed-payment amortization formula (not a separate cfg input), fixed once on the first year it runs, splits each year's payment into principal/interest. No payment is due once `year > endYear`. Optional `sellYear`: once `year >= sellYear`, payments stop and the remaining balance is wiped to zero in one non-cash journal entry -- sale proceeds/profit aren't modeled, only the liability going away. `rate` here is the loan's own fixed rate, not `Economy.interestRate`.
* `Salary.js`, `Pension.js`, `SocialSecurity.js`, `LivingExpense.js`, `LumpSum.js` -- income/expense sources, each reports its own tax treatment (or none) to `TaxCalculator`. `LivingExpense` overrides `growthRate()` to `bookkeeper.economy.inflationRate` instead of `Account`'s default `sp500Rate`. `SocialSecurity` derives `startYear` from `cfg.birthYear`/`cfg.claimAge`; a tracked `pia` (seeded from `cfg.fraMonthlyBenefit`) grows by `bookkeeper.economy.colaRate` every simulated year starting from `Simulator.startYear`, whether or not benefits have started -- the nationwide COLA raises everyone's PIA every year, not just claimants'. The claim-age adjustment (~8%/year off age 67) is applied exactly once, at the actual claim year, to whatever `pia` has grown to by then (not to the raw `cfg.fraMonthlyBenefit` input); the resulting `monthlyAmount` then continues compounding by `colaRate` every year it's paid (`runYear()`, overriding `Account`'s default growth entirely since balance/growthRate are inert boilerplate here). `Salary` gates on `cfg.endYear` (no income posted after the working years end). `LumpSum` is a one-time spending event in specific years -- `cfg.amounts` is a year -> dollar-amount map (e.g. `{"2030": 100000}`); `runYear()` stashes the current year's configured amount (0 if that year isn't listed) for `due()` to report, no tax treatment posted, same as `LivingExpense`.
* `Medicare.js` -- Part B/D premiums and a Medigap Plan G premium (all monthly cfg inputs) are combined into one `yearly` premium at construction -- the three are never needed individually, only summed, so there's no separate partB/partD/partGYearly state. `yearly` inflates every year at the shared `bookkeeper.economy.inflationRate` (not an independently-configured rate of its own), plus the IRMAA surcharge on Part B/D looked up from `bookkeeper.taxCalculator.magi` against an internal bracket table (not configurable) whose `upTo` thresholds also grow by `inflationRate` every year (surcharge dollar amounts stay fixed as configured) -- real IRMAA thresholds have been inflation-indexed since 2020, see README.md's Reference data

Orchestration (this diverged from the original `Household.js`/`Ledger.js` split -- their responsibilities ended up folded into `Config`, `Cash`, and `Bookkeeper` instead):

* `Config.js` -- reads static/json config, resolves per-account settings (age, salary trajectory, retirement date, SS claiming age/amount live here)
* `Bookkeeper.js` -- builds accounts from config, owns the journal (`JournalEntry`/`Posting`), drives `runYear()` across all accounts, runs the reconciliation check (`_reconcile()`), and reports a year's transactions/balances (`reportTransactions()`, `reportYear()`)
* `Cash.js` -- the year's cash orchestrator: `runYear()` first grows the idle balance at half of `bookkeeper.economy.interestRate` (not the full rate -- idle spending cash sits somewhere lower-yield than invested accounts), then pays each spender -- either through the shared Cash pool (`spend()`) or, when a spender's `cfg.payFrom` names an account, as much as possible straight from that account instead (`payDirect()`), bypassing Cash's own balance and `produce()`'s category capping for that portion -- generic infrastructure, not wired to anything in the example configs today (no spender sets `payFrom` by default; `HsaAccount` spends itself down through its own `earn()`-driven drawdown instead, see below, not via a spender routing through it) -- `payDirect()` is a tax-efficiency preference, not a hard requirement: it pays `min(amount, source.balance)` and returns whatever's left uncovered, which `runYear()` then routes through the normal `spend()`/`produce()` path like any other expense, instead of throwing when the named account alone can't cover it. `produce()` then covers any remaining shortfall by withdrawing from accounts in `withdrawalOrder` -- `produce()` runs before spenders' `prepareNextYear()` so a shortfall-covering withdrawal's realized gains/income are taxed the same year they're realized, not dropped. Every `withdrawalOrder` account falls into one of three tax categories (`categoryOf()`): `ltcg` (`TaxableAccount`), `income` (`TraditionalIra`/`NonSpousalInheritedIra`), or `taxFree` (everything else -- `RothIra`/`HsaAccount`, never capped). `produce()` caps withdrawals from the `ltcg`/`income` categories at `cfg.ltcgCeilingBracket`/`cfg.incomeCeilingBracket` when set (`categoryRoom()` -- these are **indices** into `bookkeeper.taxCalculator`'s live `ltcgBrackets`/`federalBrackets` arrays, not static dollar amounts, resolved fresh each year so the applied ceiling grows automatically as those bracket tables inflate via `TaxCalculator.prepareNextYear()`, instead of meaning less and less over a 30+ year simulation; for `ltcg` this also converts the realized-gain room back into a withdrawal-amount room via the account's basis fraction, since a withdrawal isn't 1:1 gain the way an IRA withdrawal is 1:1 ordinary income), falling through to the next account for the remainder. `cfg.categoryOrder` (an array of the three category names) walks accounts category-by-category instead of `withdrawalOrder`'s literal sequence when set -- the within-category sub-order still follows each account's position in `withdrawalOrder`. `produce()`'s withdrawal walk (`withdrawFrom()`) always skips a real `HsaAccount` instance regardless of its position in `categoryOrder`/`withdrawalOrder` -- an HSA is only real, tax-free money for qualified medical expenses, never a general funding source for mortgage/living-expense/tax shortfalls the way `RothIra` is, so `produce()` can never silently drain it; only `payDirect()` (a spender's `payFrom`, unused by default) or `HsaAccount`'s own scheduled drawdown (`earn()`, see below) ever reduce its balance. `produce()` runs the capped walk first, and only if a shortfall remains, a second uncapped pass over the same order before finally throwing -- ceilings are a tax-efficiency preference, not a hard limit, so a shortfall that only exists because a capped account's own ceiling fell just short of the amount it still had available no longer produces an artificial `InsufficientFundsError`. Unset `categoryOrder`/ceiling brackets/`payFrom` fall back to the original behavior with no cap, so every pre-category config/test is unaffected. `produce()` still throws `InsufficientFundsError` (`src/InsufficientFundsError.js`, carries `year`) when accounts can't cover the amount even uncapped (with the HSA exclusion in place, that's a real household shortfall, not the HSA's own balance being short), caught and scored per-candidate by the optimizer instead of crashing the whole grid
* `Simulator.js` -- thin year-by-year loop calling `bookkeeper.runYear(year)`, with an optional per-year callback (`run(onYear)`)
* `Optimizer.js` -- owns all of the optimization stuff, including running the simulator (`OPTIMIZE_VARIABLES`, the generic `run(candidates, evaluate)` brute-force search, `buildPipeline()` (`Config` -> `Bookkeeper`, `Simulator` run left to the caller), `runAll(configData, classes, variables)` (evaluates every `OPTIMIZE_VARIABLES` entry via `Config` -> `Bookkeeper` -> `Simulator` -> `Bookkeeper.netWorth()`, catching `InsufficientFundsError` per-candidate -- scored 0, displayed as `0 (YYYY)`, the rest of that variable's candidates and every other variable still run), and the console reporting. `runAll()` is a greedy/coordinate-ascent search, not a joint search over the full cross product of every variable: it keeps a running `base` config, evaluates each variable's grid against `base` (carrying forward every earlier variable's winner), then folds that variable's own winner into `base` before the next one runs -- so, e.g., the withdrawal category-order table already reflects the best SS claim age. This can miss the true joint optimum and is sensitive to `OPTIMIZE_VARIABLES`' order, but is far cheaper than the full combinatorial search and, unlike evaluating every variable in isolation against `configData`'s own literal values (the original design), actually surfaces cross-variable interactions -- confirmed on the real config: the withdrawal category-order table went from perfectly flat (no visible effect) to genuinely varying once evaluated against the optimal SS claim age (`printNetWorthTable()`/`formatScore()`: collapses to one flagged line when every candidate ties, only one candidate is legal, or every candidate ran out of money, instead of printing a table that looks like a real tradeoff was searched when none was found). A candidate with a `columns` object (e.g. the withdrawal category-order variable's `categoryOrderCandidate()`) gets a real multi-column table (`printColumnTable()`, one column per `columns` key plus Net Worth, widths computed per column) instead of the single-column fallback (`printSimpleTable()`) plain-value candidates (SS claim age) use -- a candidate with several independently-meaningful fields is unreadable crammed into one long string
* `main.js` -- thin dispatcher: builds `classes`/loads `configData` (`node src/main.js [--debug] [path/to/config.json]`, otherwise runs an illustrative built-in scenario), then either calls `new Optimizer().runAll(configData, classes, OPTIMIZE_VARIABLES)` (default -- prints a candidate/net-worth table per variable), or, under `--debug`, skips the optimizer entirely and runs one `Config` -> `Bookkeeper` -> `Simulator` pass using the input cfg values exactly as given (no candidate substitution), printing the full per-year `reportYear()` report -- `--debug` is for inspecting one scenario's accounting in detail, not the optimizer's winning candidates

Taxes (single class, as planned -- has not needed splitting):

* `TaxCalculator.js` -- federal, Colorado, LTCG, SS taxation, mortgage interest deduction, MAGI tracking for IRMAA. Qualified dividends are intentionally out of scope (not deferred) -- see below. `federalBrackets`/`ltcgBrackets`/`standardDeduction` are per-instance copies of the cfg values, grown by `bookkeeper.economy.inflationRate` every year in `prepareNextYear()` (same pattern as `Medicare.js`'s IRMAA thresholds -- real IRS numbers are inflation-indexed annually too). `ssProvisionalIncomeThresholds` is deliberately NOT grown -- unlike the others, those have never been inflation-adjusted in real law since being enacted in the 1980s/90s, so leaving them fixed is accurate, not a simplification.

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
```

Remaining mortgage balances were in the original formula but were removed
-- the house itself isn't tracked as an asset (no home equity/value
modeled), so subtracting the loan balance without the offsetting asset
it's secured against understated net worth for no real accounting reason.
Selling a mortgage still helps net worth indirectly (see the Mortgage
sell year section below), just not via a direct subtraction anymore.

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
are gone -- optimizing is now the only thing `main.js` does by default).

**`Optimizer.js` owns the whole optimization pipeline; `--debug` means a
single raw run, not the optimizer's winning candidates** -- **done**.
Reversed `Optimizer.js`'s original "knows nothing about `Config`/
`Bookkeeper`/`Simulator`/`netWorth`" design: `OPTIMIZE_VARIABLES`,
`buildPipeline()`, `runAll()` (the former `main.js`-local `runOptimize()`),
and the table-printing (`printNetWorthTable()`/`formatScore()`) all moved
onto `Optimizer`, so it genuinely "contains all the optimization stuff
including running the simulator" per the TODO that prompted this.
`main.js` shrank to building `classes`/`configData` and dispatching.
`--debug`'s meaning changed along with it: it used to run the optimizer
and additionally print the winning candidate's full year-by-year report
per variable; now it skips the optimizer entirely and runs one scenario
straight from the input cfg values (no candidate substitution) with a full
`reportYear()` per year -- for inspecting one scenario's accounting in
detail, not for seeing what the optimizer picked. `test/Optimizer.test.js`
gained unit tests for `formatScore()`/`printNetWorthTable()` and an
integration test for `runAll()`'s `InsufficientFundsError` handling, all
previously untested since they were free functions in `main.js`, which had
no test file.

**Withdrawal category order + ceilings** -- **done** (first slice of
"withdrawal source/order," the largest of the five variables). Started as
a single `cfg.ordinaryIncomeCeiling` (one number, capping only
`TraditionalIra`/`NonSpousalInheritedIra`), then generalized to three tax
categories -- `ltcg`/`income`/`taxFree` (`Cash.js`'s `categoryOf()`) --
each with its own ceiling and a searchable `cfg.categoryOrder` deciding
which category gets drawn down first, second, third
(`Cash.produce()`'s `categoryRoom()`/`accountsInCategory()`). The `ltcg`
ceiling needed one wrinkle `income` doesn't: a `TraditionalIra`
withdrawal is 1:1 ordinary income, but a `TaxableAccount` withdrawal is
only partially gain (`TaxableAccount.withdraw()`'s basis fraction), so
`categoryRoom()` converts the raw gain-room back into a withdrawal-amount
room by dividing by that fraction. Unset `categoryOrder`/ceilings fall
back to walking `withdrawalOrder` literally with no cap (today's original
drain-fully behavior), so every pre-category config/test is unaffected.
Deliberately ignores the knock-on effect of ordinary income on Social
Security's taxability (the "tax torpedo") -- a real refinement, not
needed for this cut.

The first working version capped each category at a static dollar amount
picked once at `Simulator.startYear`. Real usage against the full config
surfaced two problems, both fixed since: (1) a ceiling was a *hard* limit
even on the last account in `categoryOrder` -- a household with millions
in total assets could still throw `InsufficientFundsError` in some year
just because the specific account holding the shortfall's remainder had a
ceiling that fell a few dollars short that year, even though the money
existed elsewhere or in the same account uncapped. Fixed by making
`produce()` a two-pass walk: the capped pass first, then (only if a
shortfall remains) a second pass over the *same* order with ceilings
ignored, before finally throwing -- a ceiling is a tax-efficiency
preference, not a real constraint on what's spendable. (2) with the
`ltcgBrackets`/`federalBrackets` tables placeholder-sized (a couple of
tiers with a huge gap between boundaries), bracket-boundary ceiling
candidates were too coarse to land anywhere near real spending needs, and
a ceiling frozen at `Simulator.startYear` meant less and less as a
30+ year simulation inflated everything around it. Fixed by (a) using
real, more granular federal/LTCG bracket tables (see `TaxCalculator.js`
below), and (b) switching `cfg.ltcgCeiling`/`cfg.incomeCeiling` (dollar
amounts) to `cfg.ltcgCeilingBracket`/`cfg.incomeCeilingBracket` (**bracket
indices**), resolved against `bookkeeper.taxCalculator`'s live
`ltcgBrackets`/`federalBrackets` fresh every year in `categoryRoom()`, so
the applied dollar ceiling grows automatically right along with the real
brackets instead of staying fixed.

Wired into `Optimizer.js`'s `OPTIMIZE_VARIABLES`: candidates are the
cross product of all 6 category orderings with each capped category's
bracket *indices* plus "no cap" (the interesting choices are "fill up to
the top of this bracket," not arbitrary dollar amounts) -- `taxFree` is
never a ceiling candidate axis. An integration test in
`test/Optimizer.test.js` proves the real pipeline with a hand-computable
case: three accounts (`TaxableAccount`/`TraditionalIra`/`RothIra`), each
large enough to cover the whole shortfall alone, so only which category
is *first* in `categoryOrder` matters -- `taxFree` first beats `ltcg`
first beats `income` first, by exactly the tax each defers to (and then
has to withdraw more to cover) the following year. `test/Cash.test.js`
covers the bracket-index ceiling resolution and a dedicated test for the
uncapped-fallback-pass fix: a capped category whose ceiling alone would
leave a shortfall, confirming the second pass covers it from the same
account without throwing `InsufficientFundsError`.

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
always at least as good as waiting (confirmed on the real config: net
worth strictly decreases the longer the sale is delayed), so searching it
wouldn't be a meaningful tradeoff anyway. The user sets `sellYear` by hand
per mortgage in `config/cfg.json` instead. This holds even though
`netWorth()` no longer subtracts Mortgage's own balance at all (see
`Bookkeeper.js` below) -- selling still helps indirectly, by freeing up
the cash flow that would otherwise go to principal/interest payments,
which then compounds in whatever asset it's retained in instead.

**HSA-pays-Medicare** -- **built, then removed from `OPTIMIZE_VARIABLES` by user request** (the mechanics below are kept for history -- `payDirect()`'s fallback and `produce()`'s HSA exclusion are still both true and load-bearing today, just no longer reached via this specific variable). Every spender used to be funded
generically from the shared `Cash` pool via `Cash.produce()`'s
`withdrawalOrder` walk; routing one specific expense to one specific
account needed a deliberate extension to that flow. `Cash.js` gained an
optional `cfg.payFrom` on any spender's cfg block, checked in `runYear()`
before falling back to the normal `spend()` path -- when set, `payDirect()`
withdraws as much as possible straight from that named account and posts
to the expense category, bypassing Cash's own balance and `produce()`'s
category capping for that portion. Wired into `Optimizer.js`'s
`OPTIMIZE_VARIABLES` as a boolean-shaped variable with labeled string
candidates (`candidates: () => ['Cash', 'HsaAccount']`, `apply()`
translating `'Cash'` back to `undefined` for the real `payFrom` cfg value --
`String(undefined)` would otherwise print as the unhelpful literal
"undefined" in the optimizer's table) toggling `Medicare`'s `payFrom`. An
integration test in `test/Optimizer.test.js` proves the real pipeline with
a hand-computable case: paying Medicare's premium from the tax-free HSA
beats drawing the same amount from taxable `TraditionalIra`, by exactly the
ordinary-income tax the `TraditionalIra` path defers to (and then has to
withdraw more to cover) the following year.

`payDirect()` initially threw `InsufficientFundsError` just like
`produce()` when the named account alone couldn't cover the amount (a real
bug caught while first wiring this up: it originally let the source
account's own plain `Error` escape uncaught instead, crashing the whole
optimizer grid). That throw itself turned out to be wrong once tested
against the real config: `payFrom` is a tax-efficiency preference (pay this
tax-free if possible), not a hard requirement, so a depleted `payFrom`
account shouldn't read as the whole household being insolvent. `payDirect()`
now pays `min(amount, source.balance)` and returns whatever's left
uncovered; `runYear()` routes that remainder through the normal
`spend()`/`produce()` path like any other expense, so it only ever throws
when the household as a whole can't cover it.

Investigating *why* the real config's HSA-pays-Medicare candidate went
insolvent years before Medicare's premium alone could plausibly justify it
(a $190k-ish HSA growing every year still hit zero within about 7 years)
surfaced a bigger, separate bug: `produce()`'s general shortfall walk
doesn't distinguish `HsaAccount` from `RothIra` -- both fall into the
`taxFree` category (`categoryOf()`), so once `categoryOrder` puts `taxFree`
ahead of `ltcg`, `produce()` was silently draining the HSA to cover
ordinary mortgage/living-expense/tax shortfalls, not just Medicare. A real
HSA is only tax-free money for qualified medical expenses -- unlike
`RothIra`, it's not a general-purpose funding source. Fixed by having
`produce()`'s withdrawal walk (`withdrawFrom()`) unconditionally skip any
real `HsaAccount` instance regardless of its position in
`categoryOrder`/`withdrawalOrder`; only `payDirect()` (a spender's
`payFrom`) or a planned distribution (`earn()`) can still reduce its
balance. Confirmed on the real config: the HSA now compounds cleanly year
over year with zero `produce()`-driven withdrawals, and both
HSA-pays-Medicare candidates were solvent for the full simulation horizon
(previously one threw `InsufficientFundsError` purely from this unrelated
draining, not from Medicare's own cost).

That fix immediately raised a follow-up question, once a real HSA could
finally compound completely untouched for decades: is it actually correct
for the model to leave a large, real-world HSA balance sitting there for
30+ years, growing, with nothing ever spent from it except an occasional
Medicare premium? No -- real HSA money should be spent down for medical
expenses over life, and there will be real costs well beyond Medicare, so
tying HSA spending to one specific spender (Medicare, via a payFrom
toggle) was never the right modeling target in the first place; the
right target is HSA's own spending pace, independent of any one expense.
That reframing is what replaced this entire variable: `HsaAccount.earn()`
now derives its own level annual tax-free withdrawal (`cfg.zeroBalanceYear`,
standard amortization formula, see `HsaAccount.js` above) so the balance
reaches zero by a configured year instead of being either left alone or
drained via one specific spender -- see `HsaAccount.js`'s Modularization
bullet. `Medicare` itself just goes back to being paid normally through
the shared `Cash` pool, same as any other spender, with
no `payFrom` set in either example config.

**Deferred:** a withdrawal ceiling that varies year-to-year, instead of
one fixed number for the whole simulation -- the actually-useful version
of withdrawal-order optimization, since income mix changes over decades,
but a much bigger search space than a single scalar; a follow-up slice,
not part of any of the above.

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
