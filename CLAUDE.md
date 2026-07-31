# Financial Planner Project Brief

## TODO
- graph the accounts accounts over time
- do a tax optimization in the given year to see which accounts do
- better this is a special important when a lump sum is used
- Consider a roth conversion: spread over years, all at once.
- Should i put the graph on right?
- Explain at top
- Log.md is fine
- Dirty don't leave page prompt user to export
- Robustness graph distribution after optmized (automatically)
- Adding accounts dynamically. Basic Facts, Account Balances, Personal Decisions, Future Economy
- The accounts are names in boxes: Non-Spousal Inherited IRA, then click on one to open it to a form
- should we use bootstrap?
- Order of withdrawal is fixed by algorithm or is it dynamic in a year?
- Move Economy in one column and personal stuff on the left.
- Change Readme to introduce the project
- The wiki should be about details


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

## UI

- Plain JS, CSS, and HTML. Maybe a graphing package that's very simple
- No bundles, no images
- A form in four sections, with the results beside it on a wide window and
  stacked beneath on a narrow one
   - Basic facts
      - Birth year [select: <this year - 75>-<this year>]
   - Account balances -- one box per account rather than a fixed field per
     kind, each opening a native `<dialog>` to edit it, with a menu to add
     another. `src/ui/accountTypes.js` is the single table behind all of
     it: the menu of types, the fields each type's dialog shows, and the
     help behind each `[?]`. Adding a kind of account means an entry there
     and a matching one in `buildConfig.js`'s `ACCOUNT_FIELDS`, which
     `test/ui/accountTypes.test.js` checks stay in step. `Mortgage` is a
     box like the rest, despite being a spender internally and a liability
     rather than an asset -- to someone filling in the form it is a balance
     you open and edit. Names are free text the user chose and must be
     unique, since `Bookkeeper` keys accounts by name and a duplicate would
     silently shadow rather than fail; the form numbers duplicates as it
     creates them ("Roth IRA 2") and `buildConfigData` throws on one that
     gets through anyway. Every entry carries an explicit `class` so a name
     never has to start with a class name. This is what finally allows more
     than one account of a kind, which the real config already needed for
     two mortgages. A field may be marked `optional: true`, which exempts it
     from `app.js`'s `validate()`: `TaxableAccount.basis`,
     `Mortgage.sellYear` and `HsaAccount.zeroBalanceYear` each stand for a
     real answer when left blank ("assume I paid the whole balance", "I am
     keeping it", "spread it over my whole life expectancy") rather than a
     missing one, so demanding them would force a guess where blank already
     says something true. All three exist because the expanded config could
     express them and the form could not, which is what made `config/cfg.json`
     unable to become an exported file -- see One file format below. Basis
     is the one that changes results most: defaulting it to the balance
     means the model sees no embedded gain at all and under-taxes anything
     spent early, when the whole of that gain is invisible to it
   - Personal decisions
      - Retirement Year: [select: <this year>-<this year + 30>]
      - Life Expectancy [select: 80-110]
      - Monthly Spending: [number: blank] (excluding mortgage and medicare)
      - Monthly Salary: [number: blank]
      - Monthly Social Security at 67: [number: blank]
      - Monthly Medigap Plan G: [number: default to same value as Part B]
        (this brief originally said "Medicare Part G", which does not exist
        -- Medicare has Parts A through D, and Plan G is a Medigap
        supplement sold by private insurers. The wrong name reached the
        form label before being caught; the element id and cfg key still
        read `medicarePartG`/`partGMonthly`)
      - One-time expenses: repeatable {year, amount} rows, collapsed into
        the single `LumpSum` entry's `cfg.amounts` map. Two rows on one
        year add together, which is what entering two expenses in the same
        year means. `LumpSum` existed in the model with no UI at all until
        this
      (every flow amount on this form is monthly, since that is how a
      salary, a benefit and a premium are all quoted in real life; only
      balances are lump sums. The form keys say so too --
      `monthlySalary`/`monthlySpending` -- because the failure this
      prevents is a figure entered under the wrong convention, which is
      wrong by twelve with nothing to flag it. Internally
      `LivingExpense.balance` is still a year's spending, so `buildConfig`
      annualizes there -- the single place that conversion now happens)
   - Future economy
      - Inflation: [select: 0-10% increments .5%]
      - Interest Rate: [select: 1%-5%, increments 1%]
      - Investment Return:  [select: 5%-15%]

- Button: Optimize
- Optimal amounts with the spending strategies explained
- Graph: networth over time for optimal
- Button: Export that saves a json file of the fields only, named with a
  local-time timestamp (`retiresim-20260730T143800.json`, named for the
  program that wrote it rather than the generic `retirement-plan`) so each save
  is its own file rather than one the browser numbers "(1)", "(2)"
- Button: Import that imports a json file. The CLI reads the same file
  (`node src/cli/main.js plan.json`), so this is the one format the project
  has rather than the browser's half of two. The exported object carries a
  `version` (`buildConfig.js`'s `INPUT_VERSION`, shared by both front ends
  rather than owned by the browser), and Import refuses a file whose
  version it does not recognise rather than filling the form from fields
  that may no longer mean what they did -- the failure the monthly rename
  escaped only because the old keys happened not to match the new ones

## Modularization

Core state, one class per file:

* `Base.js` -- root class every other class extends: resolves `name`/`cfg` from `Config`, and a `toString()` that dumps all fields for error messages
* `Economy.js` extends `Base` -- shared market/inflation assumptions read once from `cfg.Economy`: `inflationRate`, `interestRate`, `sp500Rate`. `Bookkeeper` builds one and exposes it as `bookkeeper.economy`, so any class with a `bookkeeper` reference uses the shared rate instead of an independently-configured one of its own. `colaRate` is also exposed, but not read from cfg -- it's derived from `inflationRate` (a getter, `get colaRate() { return this.inflationRate; }`, so it always tracks whatever `inflationRate` currently resolves to, not a value snapshotted once at construction), hidden from clients (`SocialSecurity.js` still reads `bookkeeper.economy.colaRate`, unaware it's just `inflationRate`); a future scenario that needs COLA and general inflation to diverge would give `colaRate` its own cfg input here instead. `Mortgage.rate` is deliberately not here -- it's a fixed loan rate, not a market/inflation assumption. `sp500Rate`/`inflationRate` are both getters, not plain properties, so every existing caller (`Account.growthRate()`, `TaxCalculator`/`Medicare`'s yearly bracket/threshold growth, `SocialSecurity`'s COLA, `HsaAccount`'s drawdown calc) keeps reading `bookkeeper.economy.sp500Rate`/`.inflationRate` unchanged while the values underneath can now vary by year: `Bookkeeper.runYear()` sets `economy.currentYear` every year, and each getter looks up `historicalReturns.get(currentYear)?.sp500Rate` / `?.inflationRate` when a `RobustnessValidator` trial has called `setHistoricalReturns()` (a `Map<year, {sp500Rate, inflationRate}>` from `HistoricalReturns.js`'s `buildReturnSequence()`), else falls back to the configured base rate unchanged -- `historicalReturns` is `null` for every non-`--robustness` run, so this is a zero-behavior-change addition for the optimizer/`--debug`/every existing test. Both fields in the `Map`'s value come from the *same* sampled historical year, not independent draws -- see `HistoricalReturns.js` for why that pairing matters. `baseSp500Rate` (a separate getter) always returns the configured rate regardless of any active historical-return sequence, for the rare one-time planning calculation (`HsaAccount`'s amortized drawdown) that must not lock in a single sampled year's anomalous return for its whole multi-decade schedule -- `inflationRate` has no equivalent `base` getter since nothing currently needs one (every other `inflationRate` consumer already re-reads it fresh every year rather than caching it once).
* `RandomTable.js` -- a fixed, committed array of ~2000 pre-generated `[0,1)` floats (literal data, not a re-seedable PRNG call -- "seed table" per the former TODO). `randomValue(startYear, year, trial)` indexes `TABLE[(year - startYear + trial * TRIAL_STRIDE) % TABLE.length]` (`TRIAL_STRIDE = 67`, prime relative to the table length and comfortably above 60, so trials read well-separated slices instead of nearly-overlapping windows -- must exceed the most consecutive draws any single trial makes from one seed, which is `HistoricalReturns.js`'s Fisher-Yates shuffle drawing up to 60 in a row) -- every call for the same `(year, trial)` returns the same value forever, so a `RobustnessValidator` run building many `Bookkeeper`/`Simulator` instances per process (one per trial) gets trials that are comparable to each other and reproducible across a later rerun.
* `HistoricalReturns.js` -- `ANNUAL_RETURNS` (real S&P 500 nominal annual total returns) and `ANNUAL_INFLATION` (real US annual average CPI-U inflation rates) are two committed, same-length, same-year-ordered arrays, 1965-2025 (61 values each, sourced from published historical tables), living in JavaScript, **not** `cfg.json` -- market history is a fact, not a per-user assumption, so it's not configurable (same spirit as `Medicare.js`'s `IRMAA_BRACKETS`). Uses each *full calendar year's* real return rather than a hand-picked "crash magnitude": nobody actually liquidates at a crash's exact bottom -- money stays invested and spending only draws down what a given month needs, so a few bad months blend into the rest of the year. 2020 is the clearest example: the COVID crash happened inside it, but the full year still returned +18.40%. `buildReturnSequence({startYear, endYear, trial})` computes one trial's full year -> `{sp500Rate, inflationRate}` `Map` once, up front (not re-rolled lazily, so every account touching either rate in a trial sees identical draws) -- walks a Fisher-Yates shuffle (`shuffledIndices()`) of all 61 real historical years **without replacement**: once a year's used, it isn't used again until every other year has also been used once (a "shuffled bag," reshuffled only when exhausted, not drawn with replacement from the start every time -- superseded design, see the Robustness validator narrative below). If a horizon exceeds 61 years, the pool reshuffles (a genuinely fresh permutation, not the same one repeated -- each cycle sweeps the `year` argument fed to `randomValue()` forward by a full 61 rather than reusing the same slice, which would silently collide) and continues. Both figures read from that *same* sampled year (`ANNUAL_RETURNS[index]`/`ANNUAL_INFLATION[index]`) -- deliberately not two independent draws, since real inflation and real market returns aren't independent (1973-74's stagflation and 2022's inflation-driven bear market both pair a weak/negative return with well-above-average inflation); sampling them separately would understate that correlated risk, exactly the double-whammy that hurts a retiree most (weaker portfolio *and* faster-growing spending in the same year). Deliberately **not** a chronological replay of real history (there's no reason simulated 2026 should behave like real 1965 just because both are "first"), and deliberately has **no** separate "does this year crash" gate, magnitude table, or cooldown: the real annual figures already contain both ordinary and crash years in their true historical proportions and relative frequency, so a shuffled walk through all of them reproduces that mix without a hand-tuned probability or magnitude list, while no longer letting a single lucky or unlucky year recur more than its real, one-time share within a 61-year horizon.
* `Account.js` extends `Base` -- balance, `grow(rate)`, `deposit()`, `withdraw()`, `growthRate(bookkeeper)` (defaults to `bookkeeper.economy.sp500Rate`, overridable -- see `LivingExpense.js`), and `runYear()` (grows the balance at `growthRate()` and posts the change)
* `TaxableAccount.js` extends Account -- adds basis tracking. `_checkBasis()` (`basis <= balance`) is only ever called from the constructor now, not from `deposit()`/`withdraw()` -- it was originally called from both, but a sampled historical return (`HistoricalReturns.js`, negative `sp500Rate` via `grow()`) can legitimately drop `balance` below `basis` (an unrealized loss, same as a real brokerage statement), and `grow()` never checked this invariant in the first place, so the check could only ever fire *later*, inside an unrelated `deposit()`/`withdraw()` call, once `--robustness` made negative growth possible for the first time. The constructor check stays -- `basis > balance` in a freshly-configured account is still almost certainly a cfg typo, not a real state. `withdraw()`'s proportional basis-reduction formula already produces a negative `gain` (a capital loss) correctly when the account is underwater, with no code change needed there.
* `TraditionalIra.js`, `RothIra.js`, `NonSpousalInheritedIra.js` extend Account -- each encodes its own RMD/withdrawal rules
* `HsaAccount.js` extends `RothIra` -- no tax consequence on withdrawal, same as Roth, but replaces `RothIra`'s plain `cfg.withdraw` fixed-dollar config entirely with a computed, scheduled drawdown: HSA money should be spent down for medical expenses over life (standing in for costs beyond just `Medicare`, not tied to any one spender), not left to accumulate. `earn()`'s `_ensureDrawdown()` derives a level annual tax-free withdrawal, once, from `cfg.zeroBalanceYear` and the account's own growth rate (`growthRate(bookkeeper)`, same `sp500Rate` every other investment account uses) via the standard fixed-payment amortization formula -- the same approach `Mortgage.js` uses for its payment (mirroring `Mortgage._ensurePayment()`'s `(cfg.endYear - year + 1)` shape exactly, `zeroBalanceYear` playing the same role `endYear` does), just inverted (a growing balance being drawn down instead of a loan being paid down), and using the annuity-due variant of that formula (withdraw, then grow, matching `Cash.earn()` running before `Account.runYear()`'s growth in `Bookkeeper.runYear()`'s order) rather than `Mortgage.js`'s ordinary-annuity version. Computed once and held fixed for the rest of the account's life, like `Mortgage`'s payment; throws if `cfg.zeroBalanceYear` isn't after the year it's first computed. No withdrawal once `year > cfg.zeroBalanceYear`, same guard shape as `Mortgage.runYear()`'s `endYear` check. `Cash.produce()`'s exclusion of `HsaAccount` from the general withdrawal walk is unaffected -- the scheduled drawdown runs through `earn()`, the same forced-distribution channel RMDs already use, not `produce()`. Does not model a non-spouse-inherited HSA's real death-tax treatment (full balance as ordinary income in one lump sum) -- built once, then explicitly dropped: the resulting liability couldn't correctly reduce net worth anyway given this project's existing 1-year tax-payment lag (nothing pays a liability accrued in the simulation's very last year, since there's no year after it to pay it in, and `TaxCalculator`'s balance is deliberately excluded from `netWorth()`), and it was largely redundant with the scheduled drawdown besides
* `Mortgage.js` -- balance, rate, `endYear` (payoff year); the monthly payment is derived from those three via the standard fixed-payment amortization formula (not a separate cfg input), fixed once on the first year it runs, splits each year's payment into principal/interest. No payment is due once `year > endYear`. Optional `sellYear`: once `year >= sellYear`, payments stop and the remaining balance is wiped to zero in one non-cash journal entry -- sale proceeds/profit aren't modeled, only the liability going away. `rate` here is the loan's own fixed rate, not `Economy.interestRate`.
* `Salary.js`, `Pension.js`, `SocialSecurity.js`, `LivingExpense.js`, `LumpSum.js` -- income/expense sources, each reports its own tax treatment (or none) to `TaxCalculator`. `LivingExpense` overrides `growthRate()` to `bookkeeper.economy.inflationRate` instead of `Account`'s default `sp500Rate`. `SocialSecurity` derives `startYear` from `cfg.birthYear`/`cfg.claimAge`; a tracked `pia` (seeded from `cfg.fraMonthlyBenefit`) grows by `bookkeeper.economy.colaRate` every simulated year starting from `Simulator.startYear`, whether or not benefits have started -- the nationwide COLA raises everyone's PIA every year, not just claimants'. The claim-age adjustment (~8%/year off age 67) is applied exactly once, at the actual claim year, to whatever `pia` has grown to by then (not to the raw `cfg.fraMonthlyBenefit` input); the resulting `monthlyAmount` then continues compounding by `colaRate` every year it's paid (`runYear()`, overriding `Account`'s default growth entirely since balance/growthRate are inert boilerplate here). `Salary` gates on `cfg.endYear` (no income posted after the working years end). `LumpSum` is a one-time spending event in specific years -- `cfg.amounts` is a year -> dollar-amount map (e.g. `{"2030": 100000}`); `runYear()` stashes the current year's configured amount (0 if that year isn't listed) for `due()` to report, no tax treatment posted, same as `LivingExpense`.
* `Medicare.js` -- Part B/D premiums and a Medigap Plan G premium (all monthly cfg inputs) are combined into one `yearly` premium at construction -- the three are never needed individually, only summed, so there's no separate partB/partD/partGYearly state. `yearly` inflates every year at the shared `bookkeeper.economy.inflationRate` (not an independently-configured rate of its own), plus the IRMAA surcharge on Part B/D looked up from `bookkeeper.taxCalculator.magi` against an internal bracket table (not configurable) whose `upTo` thresholds also grow by `inflationRate` every year (surcharge dollar amounts stay fixed as configured) -- real IRMAA thresholds have been inflation-indexed since 2020, see the wiki's Reference data page. Nothing is owed before the year the person turns 65: `startYear` is derived in the constructor from a required `cfg.birthYear` plus a non-configurable `ELIGIBILITY_AGE` (65 is a fact of law, same reasoning as `IRMAA_BRACKETS` not being cfg), and `runYear()` sets `owed = 0` for any earlier year -- the same nothing-before-eligible shape as `SocialSecurity.earn()`'s `year < startYear` gate, reporting a zero amount rather than no amount exactly like `Mortgage.runYear()` past `endYear` (`Cash.runYear()` already skips a zero `due()`). The gate deliberately sits *after* the yearly premium/threshold growth, not before it: the premium a 60-year-old will actually face at 65 is the inflated one, so both have to keep compounding through the ineligible years even though nothing is paid in them. A missing `birthYear` throws rather than being tolerated -- it would make `startYear` `NaN`, every `year < NaN` is false, and the gate would silently vanish, reinstating the original bug (premiums charged from the simulation's first year regardless of age) with no visible symptom. Pre-65 health insurance is deliberately **not** a separate expense: per user direction it's assumed to be rolled into `LivingExpense`'s yearly spending, which also avoids the alternative failure mode of gating Medicare while leaving an early retiree's real, typically-higher ACA/private premiums unmodeled entirely. Real Medicare is also reachable before 65 via disability/ALS/ESRD, which this project doesn't model

Orchestration (this diverged from the original `Household.js`/`Ledger.js` split -- their responsibilities ended up folded into `Config`, `Cash`, and `Bookkeeper` instead):

* `Config.js` -- reads static/json config, resolves per-account settings (age, salary trajectory, retirement date, SS claiming age/amount live here)
* `Bookkeeper.js` -- builds accounts from config, owns the journal (`JournalEntry`/`Posting`), drives `runYear()` across all accounts, runs the reconciliation check (`_reconcile()`), and reports a year's transactions/balances (`reportTransactions()`, `reportYear()`). `assetBalances()` returns the same accounts `netWorth()` counts, keyed by name, and `netWorth()` sums *that* rather than walking `accounts` itself -- so the UI's stacked per-account chart always adds up to exactly the net-worth line drawn beside it, instead of two independently-maintained notions of "which accounts are assets" drifting apart. `NonSpousalInheritedIra`/`HsaAccount` need no mention of their own in the `isAsset` test, since they extend `TraditionalIra`/`RothIra`
* `Cash.js` -- the year's cash orchestrator: `runYear()` first grows the idle balance at half of `bookkeeper.economy.interestRate` (not the full rate -- idle spending cash sits somewhere lower-yield than invested accounts), then pays each spender -- either through the shared Cash pool (`spend()`) or, when a spender's `cfg.payFrom` names an account, as much as possible straight from that account instead (`payDirect()`), bypassing Cash's own balance and `produce()`'s category capping for that portion -- generic infrastructure, not wired to anything in the example configs today (no spender sets `payFrom` by default; `HsaAccount` spends itself down through its own `earn()`-driven drawdown instead, see below, not via a spender routing through it) -- `payDirect()` is a tax-efficiency preference, not a hard requirement: it pays `min(amount, source.balance)` and returns whatever's left uncovered, which `runYear()` then routes through the normal `spend()`/`produce()` path like any other expense, instead of throwing when the named account alone can't cover it. `produce()` then covers any remaining shortfall by withdrawing from accounts in `withdrawalOrder` -- `produce()` runs before spenders' `prepareNextYear()` so a shortfall-covering withdrawal's realized gains/income are taxed the same year they're realized, not dropped. Every `withdrawalOrder` account falls into one of three tax categories (`categoryOf()`): `ltcg` (`TaxableAccount`), `income` (`TraditionalIra`/`NonSpousalInheritedIra`), or `taxFree` (everything else -- `RothIra`/`HsaAccount`, never capped). `produce()` caps withdrawals from the `ltcg`/`income` categories at `cfg.ltcgCeilingBracket`/`cfg.incomeCeilingBracket` when set (`categoryRoom()` -- these are **indices** into `bookkeeper.taxCalculator`'s live `ltcgBrackets`/`federalBrackets` arrays, not static dollar amounts, resolved fresh each year so the applied ceiling grows automatically as those bracket tables inflate via `TaxCalculator.prepareNextYear()`, instead of meaning less and less over a 30+ year simulation; for `ltcg` this also converts the realized-gain room back into a withdrawal-amount room via the account's basis fraction, since a withdrawal isn't 1:1 gain the way an IRA withdrawal is 1:1 ordinary income), falling through to the next account for the remainder. `cfg.categoryOrder` (an array of the three category names) walks accounts category-by-category instead of `withdrawalOrder`'s literal sequence when set -- the within-category sub-order still follows each account's position in `withdrawalOrder`. `produce()`'s withdrawal walk (`withdrawFrom()`) always skips a real `HsaAccount` instance regardless of its position in `categoryOrder`/`withdrawalOrder` -- an HSA is only real, tax-free money for qualified medical expenses, never a general funding source for mortgage/living-expense/tax shortfalls the way `RothIra` is, so `produce()` can never silently drain it; only `payDirect()` (a spender's `payFrom`, unused by default) or `HsaAccount`'s own scheduled drawdown (`earn()`, see below) ever reduce its balance. `produce()` runs the capped walk first, and only if a shortfall remains, a second uncapped pass over the same order before finally throwing -- ceilings are a tax-efficiency preference, not a hard limit, so a shortfall that only exists because a capped account's own ceiling fell just short of the amount it still had available no longer produces an artificial `InsufficientFundsError`. Unset `categoryOrder`/ceiling brackets/`payFrom` fall back to the original behavior with no cap, so every pre-category config/test is unaffected. `produce()` still throws `InsufficientFundsError` (`src/InsufficientFundsError.js`, carries `year`) when accounts can't cover the amount even uncapped (with the HSA exclusion in place, that's a real household shortfall, not the HSA's own balance being short), caught and scored per-candidate by the optimizer instead of crashing the whole grid. Whatever's left in `Cash` after `produce()` (a no-op when the balance is already positive) is swept into `TaxableAccount` (`sweepSurplus()`) rather than left to idle at Cash's below-market half-`interestRate` forever -- a plain `deposit()`, so `basis` increases by the same amount as `balance` (fresh principal, not a prior gain) and no tax event is posted. No-ops without throwing when no `TaxableAccount` is configured, unlike `bookkeeper`/`taxCalculator` elsewhere -- a household legitimately might not have one
* `Simulator.js` -- thin year-by-year loop calling `bookkeeper.runYear(year)`, with an optional per-year callback (`run(onYear)`)
* `pipeline.js` (`src/biz/`) -- `buildPipeline(configData, classes)` returns `{config, bookkeeper}`, the one place a plan becomes a running simulation. `Optimizer.runAll()`, `RobustnessValidator.run()` and the CLI's `--debug` report all need the identical three lines and each used to write them out again; what differs between them is only what they do with the result. Clones `configData` rather than trusting the caller, since `Bookkeeper` writes each entry back through `config.set()` as it builds and the optimizer builds hundreds of these from one shared base. `candidateConfigData(configData, variable, candidate)` is the substitution half, kept separate so everything that is not searching can build a pipeline without inventing a variable and a candidate it does not have
* `classes.js` (`src/biz/`) -- `CLASSES`, every class a config entry's `class` field can name. One registry rather than one per front end: the CLI and the browser each had their own and they had already drifted (the browser's was missing `Pension`), so a config naming one would have run under the CLI and thrown in the browser, for no reason findable from the config itself
* `Optimizer.js` (`src/biz/`) -- owns all of the optimization stuff, including running the simulator, but deliberately IO-less: `runAll()` *returns* data (an array, one entry per `OPTIMIZE_VARIABLES` variable: `{label, netWorth: {best, score, all}, failedYears, endingBalances, netWorthByYear, balancesByYear}`) instead of printing, so both the CLI and the browser UI can consume the same result. `balancesByYear` (a `{year, balances}` array, `balances` being `Bookkeeper.assetBalances()` captured *during* the winner's re-run rather than derived from the ending balances afterwards -- the point is how the split between accounts shifts as one drains and another keeps growing, which the final year alone can't show) is what the UI's net-worth chart is actually drawn from; it's `null` alongside the other detail fields when the winner ran out of money. That chart started as two -- a net-worth line plus a separate stacked accounts chart -- and was merged into one on the observation that the accounts *are* the net worth (`assetBalances()` is exactly what `netWorth()` sums), so stacking them makes the top edge of the stack the net-worth curve itself; drawing that curve separately showed the same number twice while hiding the more useful half. The total is deliberately not a dataset of its own: on a stacked axis it would be stacked on top of the sum and double the height, so it's surfaced in the tooltip footer instead. `netWorthByYear` stays in the result and is still what the CLI reports and what the UI tests for a plan that ran out of money, it's just no longer what gets plotted. `winningConfigData(configData, results, variables)` rebuilds the chosen plan as a full configData by applying each variable's winner to a clone -- the input the `RobustnessValidator` needs, which previously had to be hand-copied into `cfg.json` before `--robustness` could see it. Deliberately a separate method rather than an extra `runAll()` return value, which would change its return type and every caller with it; it relies on `results` being in the same order as `variables`, which `runAll()` guarantees by pushing one result per variable. `OPTIMIZE_VARIABLES` currently holds two entries: withdrawal category order + ceilings, and Social Security claim age (see Optimize Variables below for both). Their order in the list no longer affects the answer, only the order the tables print in -- see the joint-search note below for why it used to matter and why that was never a real fix. The generic `run(candidates, evaluate)` brute-force search is unchanged from its original design; building a plan into a running simulation moved out to `pipeline.js` (see above), shared with `RobustnessValidator` and the CLI. `runAll()` is a **joint search over the full cross product** of every variable's candidates -- it builds every combination, scores each one, and takes the global best, then re-runs that winning combination once more (`bestCombinationDetail()`) to capture its ending balances and year-by-year series. Each variable's returned table is a *marginal*: for each of its own candidates, the best score any combination containing that candidate reached (`marginal()`), which is the number a reader of the table actually wants -- "what is claiming at 70 worth, given the best withdrawal strategy to pair with it." `marginalFailures()` likewise counts a candidate as having run out of money only when *every* combination containing it did; a candidate that works alongside some other choice was merely paired badly, not infeasible. It was a greedy/coordinate-ascent search until a real config broke it, and the break is worth recording because reordering the variables had already been tried as the fix and does not work. Greedy kept a running `base`, evaluated each variable's grid against it, and folded that variable's winner in before the next ran. That is correct only while each variable's grid holds at least one *workable* candidate. The real config's withdrawal strategy is solvent only at a Social Security claim age of 70, so measured against the baseline 67 every one of the 126 withdrawal candidates failed, the "winner" was an arbitrary pick among equally-dead candidates, and the claim-age search that followed was judged against that arbitrary strategy and failed everywhere too -- the CLI reported a solvent plan as having no solution at all. This is the same fault CLAUDE.md already recorded from the other direction (claim age searched *first*, every age judged against a stale `categoryOrder`, every age looking insolvent); ordering the variables only moves which one gets judged unfairly. The cross product removes the question of order entirely, since there is no "first" variable to be measured against an unsearched second one. The cost is the product of the grid sizes rather than their sum -- 756 simulations rather than 132 as the variables stand, about a second -- and a third variable multiplies it again, at which point this needs something cleverer than exhaustive search. A wrong answer arrived at quickly is not the cheaper option. `src/cli/OptimizerReport.js` owns the CLI's console-printing half (`formatScore()`, `netWorthTableLines()`/`simpleTableLines()`/`columnTableLines()`, `report()` joining a full run's tables + ending balances into one string `main.js` prints) -- same string-building-not-printing split `RobustnessValidator.js` already had. `netWorthTableLines()` collapses to one flagged line when every candidate ties, only one candidate is legal, or every candidate ran out of money, instead of printing a table that looks like a real tradeoff was searched when none was found. A candidate with a `columns` object (e.g. the withdrawal category-order variable's `categoryOrderCandidate()`) gets a real multi-column table (`columnTableLines()`, one column per `columns` key plus Net Worth, widths computed per column) instead of the single-column fallback (`simpleTableLines()`, used by the claim-age variable's plain-number candidates).
* `RobustnessValidator.js` -- deliberately a separate step run *after* the optimizer, not part of it: `run(configData, classes, trials = 200)` takes one plan, in practice `Optimizer.winningConfigData()`'s output handed straight over by both the CLI and the browser, and stress-tests *that one plan* against `trials` different sampled historical-return sequences (`HistoricalReturns.js`) instead of searching for a better one -- it answers "how fragile is the plan we already picked," not "what's the best plan." Builds one `Bookkeeper`/`Simulator` per trial, calls `bookkeeper.economy.setHistoricalReturns(buildReturnSequence({..., trial}))` before running it, and catches `InsufficientFundsError` per trial the same way `Optimizer.runAll()` catches it per-candidate, so one bad trial doesn't abort the batch. `report()` prints the insolvency rate (count and %, plus the failure-year range with its mean and population standard deviation -- range alone doesn't say whether failures cluster tightly around one point in the horizon or spread evenly across it) and a net-worth distribution (min/p10/median/p90/max) instead of a single Net Worth number -- an average alone would hide exactly what this exists to surface, how often the plan fails outright and how wide the spread is. Net worth uses percentiles (heavily right-skewed -- a few lucky trials compound to outsized values while insolvent trials cluster at exactly 0, so the median is more representative than the mean); failure years use mean/sigma instead (a smaller, roughly symmetric sub-sample, where mean+sigma is the standard compact "center + spread" summary). The plan used to be whatever `categoryOrder`/ceilings/`claimAge` were sitting in `cfg.json`, copied there by hand from an earlier optimizer run, which meant it could quietly be stress-testing a plan that went stale the moment a better one was found. Nothing hand-copies anything now: the CLI and the browser both run it automatically on the winning plan at the end of every optimize, with the same 200-trial default (`DEFAULT_TRIALS`, no longer a CLI argument). This is only viable because `run()` was already IO-less (`report()` being the separate string-builder) and because 200 trials measure at well under a tenth of a second, so it needs no worker and adds no perceptible delay to the click.
* `main.js` -- thin dispatcher: `node src/cli/main.js [--debug] [path/to/plan.json]`. The file it reads is one the browser's **Export** button wrote (the form's own fields, `INPUT_VERSION`-stamped), not the expanded simulation config -- so a plan moves between the CLI and the browser without being retyped, and neither can decide anything the other would decide differently. With no argument an illustrative built-in scenario stands in. It refuses a file whose `version` it does not recognise, exactly as `src/ui/app.js`'s `importFields()` does and for the same reason. Then it runs the same sequence `app.js` runs on Optimize, printed instead of drawn: `buildConfigData()` -> `Optimizer.runAll()` -> `OptimizerReport.report()` -> `winningConfigData()` -> `RobustnessValidator`, the last skipped when the winning plan already ran out of money under one steady return (nothing to learn from 200 worse ones -- the browser skips it on the same test). `--debug` adds the winning plan's full per-year `reportYear()` report at the end; it no longer means "skip the optimizer and run the file exactly as given," because the input format cannot express a strategy for that to honour, and the plan worth inspecting in detail was always the chosen one rather than the baseline. It runs on the configured rates, not a sampled sequence -- printing one trial's accounting beside a robustness summary that already covers all of them would be printing one arbitrary roll of the dice. The `--robustness [N]` flag is gone: it is no longer opt-in.

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

**Social Security claiming age** -- **done, then removed from
`OPTIMIZE_VARIABLES` by user request, then revived on a narrower
rationale once the UI's Facts/Predictions form existed.** First pass:
claiming age is a personal/health decision (life expectancy, not just net
worth), not something that should get automatically net-worth-optimized
the way a tax-efficiency choice like withdrawal order is. Removing it
also happened to fix a real bug: with claim age evaluated *first* in the
greedy chain, every claim-age candidate was scored against whatever
`categoryOrder` the *next* variable hadn't optimized yet (whatever was
already sitting, possibly stale, in `cfg.json`) -- at a high enough
`LivingExpense` that stale ordering alone made every claim age look
insolvent, even though a better ordering (found only by the second
variable's own search, starting from that already-bad claim-age choice)
would have survived.

**Revived** once the UI's simplified form fixed `claimAge` at 67 with no
way for a user to express a preference at all (see `buildConfig.js`'s
Files to add bullet), surfacing a real, narrower case the "personal
choice" framing didn't cover: delaying to 70 maximizes lifetime benefit,
but only if the household can actually afford to bridge the gap years
without it -- someone with little other savings may be forced to claim
sooner out of necessity, not preference. `OPTIMIZE_VARIABLES` gained a
second entry, `candidates()` calling `claimAgeCandidates()` (see below)
and `apply()` setting `claimAge` on the `SocialSecurity` entry.
`Optimizer.run()`'s existing `InsufficientFundsError` -> score-0 handling
already implements "try 70 and back off" with no separate search loop:
among *feasible* candidates a later claim age generally scores higher
(bigger permanent benefit), so evaluating every candidate and taking the
max naturally lands on the latest age that doesn't cause a shortfall.
Deliberately ordered *second* in `OPTIMIZE_VARIABLES`, after withdrawal
order, not first -- exactly to avoid the stale-ordering bug from the
first pass above: claim age is now always judged against the
already-optimized withdrawal strategy, not a stale or default one.
Confirmed against a hand-computable integration test (thin savings force
the earliest actionable age; ample savings pick 70) and against two
illustrative scenarios run through the real `buildConfigData()` ->
`Optimizer.runAll()` pipeline. `src/ui/app.js`'s strategy description
reports the chosen claim age as a plain fact ("chosen to maximize
lifetime benefit without running out of money before then"), not as a
numbered step in the withdrawal-order list -- it's a separate decision,
not part of that sequence.

`SocialSecurity.js` takes `birthYear`/`claimAge`/`fraMonthlyBenefit`,
deriving `startYear` (`birthYear + claimAge`) and `monthlyAmount`
(`fraMonthlyBenefit` adjusted ~8%/year for claiming before/after age 67)
in the constructor, replacing the old independently-entered
`monthlyAmount`/`startYear` fields. `claimAge` outside 62-70 throws.
`SocialSecurity.claimAgeCandidates({ birthYear, asOfYear })` clamps the
low end up to `asOfYear - birthYear` -- claim ages already passed as of
`Simulator.startYear` aren't real, actionable choices, so they're
excluded rather than offered as candidates (clamps the high end at 70
too, so someone already past 70 still gets one candidate: claim now).
Originally built for a UI dropdown that never used it directly, then
picked back up by `Optimizer.js`'s revived claim-age variable instead.

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
needed for this cut (issue #23).

The `ltcg` ceiling had a second, larger version of the same fault, fixed
since (issue #27): a capital-gains bracket is a threshold on **total
taxable income**, not on gains alone, so `categoryRoom()` has to measure
down from the bracket top past this year's taxable ordinary income rather
than up from zero. It subtracted only the gains realized so far, as though
the household had no other income. Early in a plan that is often true and
the two agree exactly; once Social Security and RMDs arrive, ordinary
income alone can exceed the top of the 0% bracket, so the real room is
nothing at all while the old expression went on offering the whole bracket
every year for the rest of the horizon. The ceiling then limited nothing,
and a strategy chosen to keep gains inside the 0% band spent the plan's
later decades realizing gains taxed at 15%. Measured on the benchmark
scenario (`test/benchmark.test.js`): the fix is worth 145,729 (3.4%) and,
more tellingly, changes which withdrawal order wins -- so it was not a
scoring error but a broken ceiling making the better strategy genuinely
worse to execute, which the optimizer then correctly avoided. `TaxCalculator`
gained `taxableOrdinary()` and `yearInputs()` so the floor comes from the
one place that already computes it for the tax itself; two derivations of
the same figure is how they came to disagree. The `LTCG_BRACKETS`
boundaries were rounded (49,000/545,000) while the ordinary ones were
exact -- corrected to the real 48,350/533,400, which matters more than a
1% error usually would because the ceiling candidates *are* those
boundaries.

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

**One file format for the CLI and the browser** -- **done**. The two read
two different files: the browser exported the form's own fields, while
`config/cfg.json` was the *expanded* config `buildConfigData()` produces
from those fields. Not two dialects of one format -- one was the input to
the function that made the other -- so a plan could not move between them
and each had its own idea of what the best strategy was. `config/cfg.json`
is now a file in the export shape, and `main.js` runs it through
`buildConfigData()` exactly as `app.js` does.

Three optional form fields had to exist first, because the expanded config
could say things the form could not: `TaxableAccount.basis`,
`Mortgage.sellYear` (supported by `Mortgage.js` since it was built, never
enterable) and `HsaAccount.zeroBalanceYear`. Deliberately *not* added, and
dropped from the converted file: `categoryOrder`/`ltcgCeilingBracket`/
`incomeCeilingBracket`/`claimAge` (the optimizer computes all four --
keeping a copy only creates the chance of stress-testing a plan that went
stale the moment a better one was found), `Simulator.startYear` (now
always the current year, as the browser already assumed, so the same file
run a year later simulates a horizon a year shorter), the derived
`Salary.endYear`/`RothIra.withdraw`, the Medicare Part B/D premiums
(constants in `buildConfig.js`), and a `notes` block nothing read. A
field-by-field diff of the converted file against the original confirmed
everything else rebuilds identically.

`claimAge` is **not** the retirement year, which was the natural
assumption when this was scoped: retirement is when salary stops, claim
age is when Social Security starts, and the gap between them -- retire at
62, claim at 70, bridge eight years from savings for a permanently larger
benefit -- is exactly what that search variable is about.

`INPUT_VERSION` moved from `src/ui/app.js` to `buildConfig.js`, since both
front ends now read the same files and refuse an unrecognised version for
the same reason. Making them upgrade an older file instead of refusing it
is issue #18, deliberately built before the next version bump rather than
during it, while the chain is still a no-op and cheap to test.

Converting the real config is what exposed the greedy optimizer's
failure -- see `Optimizer.js` above. With the hand-copied `claimAge` gone,
the joint search had to exist before the CLI could report that plan
correctly at all.

It also exposed a real bug in `NonSpousalInheritedIra.earn()`: past the
10-year deadline it threw unconditionally, so an account that emptied
exactly on schedule failed in the year after doing everything right. Any
horizon reaching eleven years past an inheritance hit it; the illustrative
scenario had simply never run that long. Now emptied-to-tolerance past the
deadline returns no distribution, and only real money still sitting there
throws. Tolerance rather than exact zero, and `Math.abs` rather than `=== 0`
(the user's catch), for the same reason `Bookkeeper._reconcile()` allows
half a cent: a residue that small is rounding, not money somebody failed
to distribute, and a small negative is not undistributed money at all.

**Robustness validator (seeded randomness / market crashes / Monte
Carlo)** -- **done**, the last item from the former top-level TODO. User
direction, arrived at over several turns: this is a **separate step run
after the optimizer**, not folded into `Optimizer.runAll()`'s per-candidate
search -- it stress-tests the one plan already chosen (in practice, the
plan already copied into `cfg.json`'s `Cash.categoryOrder`/ceilings/
`claimAge`, the same "no candidate substitution" values `--debug` reads),
not a variable the optimizer searches over. "I'd like to be able to set
cfg.json up to specify the order and the thresholds" turned out, after a
few rounds of clarification, to be about a *different* piece of work
entirely -- getting the optimizer's winning `categoryOrder`/ceiling
*bracket indices* copied into `cfg.json` so `--debug` reports the
best-known strategy (see the `Cash.categoryOrder`/etc `cfg.json` note) --
not about the crash model's own configuration, which was designed
separately once that was resolved.

`RandomTable.js`/`HistoricalReturns.js`/`Economy.js`'s `sp500Rate`/
`inflationRate` getters (see their own Modularization bullets above)
implement the three original TODO items, though the crash-specific two of
the three ended up
superseded by a simpler, better-calibrated design (below): a literal
committed seed table (not a re-seedable PRNG, unchanged), and Monte Carlo
trials via `RobustnessValidator` (unchanged), but "a crash based on a
probability... base it on historical crashes" turned into something more
direct than a probability-and-magnitude model layered on top of a flat
assumed rate.

**First cut, since superseded**: an independent per-year crash
probability (calibrated to ~4 real 20%+ bear markets in ~35 years, about
11%/year) triggering a magnitude drawn from a hand-picked list of ~10
historical crash-year figures, applied on top of a flat configured
`sp500Rate` (e.g. 7%) every other year. Wiring a real crash (a negative
`sp500Rate`, possible for the first time in this project's history)
through the real config surfaced a genuine pre-existing bug in the
process, not a new one: `TaxableAccount._checkBasis()`'s
`basis <= balance` invariant was only ever true by accident, because
`grow()` had only ever been called with a positive rate before -- see
`TaxableAccount.js`'s Modularization bullet for the fix (the check now
only runs at construction, not after every `deposit()`/`withdraw()`).
Found by running `--robustness` against `main.js`'s own illustrative
`DEFAULT_CONFIG_DATA`, not the real config -- a reminder that the
illustrative scenario is still worth exercising through new code paths,
not just kept around for `node src/main.js` to have a no-args default.

That design had a real calibration flaw the user caught: a flat "normal
year" rate plus an *additional* separate crash overlay double-counts the
downside, since the real historical average return already has crash
years blended into it -- a 7% "normal year" assumption stacked with
explicit -20% to -45% crash years on top produces an effective blended
average far below both the configured rate and real history (verified:
~3.2%/year for the first-cut parameters, against a real ~10-12% nominal
historical average). The user's fix: drop the two-part model entirely.
`HistoricalReturns.js` now samples real S&P 500 **full-calendar-year**
total returns (not hand-picked "crash magnitudes") uniformly at random,
every year, unconditionally -- no probability gate, no magnitude list, no
cooldown. Real full-year figures already blend good and bad months/years
together the way an investor who stays invested and only withdraws what a
given month needs actually experiences (2020's COVID crash still ended
the year at +18.40%, illustrating why a "worst month annualized" magnitude
would have been wrong to use as a whole year's rate in the first place).
This data is a committed JavaScript constant, not `cfg.json` -- market
history is a fact, not a per-user assumption, unlike everything else this
project exposes via config (`Economy`, tax brackets, Medicare premiums)
specifically so real numbers can replace illustrative placeholders
without touching code; this is the one deliberate exception.

**No-repeat sampling within a trial** -- **done**, a follow-up the user
caught after running 500 real trials: the first cut sampled independently
with replacement, so the same historical year (even an extreme one) could
be drawn more than once inside a single trial's horizon -- something that
can never happen in real sequential history. Investigating a suspiciously
large max net worth outcome traced directly to this: the single best
trial's outsized result was explained partly by the same great historical
year being drawn multiple times within one horizon. Fixed by replacing
the independent draw with a Fisher-Yates shuffle of all 61 years, consumed
in order without replacement, reshuffling only once the pool is exhausted
(see `HistoricalReturns.js`'s Modularization bullet above) -- back-to-back
repeats of the *same* year are no longer possible within one 61-year
cycle, though back-to-back *bad* years drawn from different real years
(e.g. 1973 then 1974) remain possible, same as real history. Required
bumping `RandomTable.js`'s `TRIAL_STRIDE` from 47 to 67, since the shuffle
needs up to 60 consecutive draws per trial-seed and the old stride was too
small to keep that many consecutive draws from overlapping between
adjacent trials. Confirmed on the real config: the 500-trial max net worth dropped
materially, while insolvency rate and the rest of the distribution stayed
essentially unchanged -- exactly what removing an artificially-inflatable
extreme tail should do, without otherwise changing the risk picture.

**Dynamic inflation** -- **done**, a follow-up the user spotted after the
above landed: `--robustness` sampled a real historical *market* return
every year, but `inflationRate` stayed the flat configured constant
regardless -- decoupled from whichever historical year's return had just
been drawn. Real inflation and real market returns aren't independent
(1973-74's stagflation, 2022's inflation-driven bear market both pair a
weak/negative return with well-above-average inflation), so sampling them
separately understated exactly the double-whammy that hurts a retiree
most: a weaker portfolio *and* faster-growing spending (`LivingExpense`,
tax brackets, Medicare premiums, Social Security COLA -- everything that
scales off `inflationRate`/`colaRate`) in the same year. Fixed by pairing
both figures to the *same* sampled historical year (`HistoricalReturns.js`'s
`ANNUAL_INFLATION`, same index as `ANNUAL_RETURNS`) instead of drawing
them independently, and making `Economy.inflationRate` a getter the same
way `sp500Rate` already was (`colaRate` -- already derived from
`inflationRate` -- picked up the dynamism for free, no separate change
needed). Architecturally clean specifically because `TaxCalculator`,
`Medicare`, and `SocialSecurity` all already re-read `inflationRate`/
`colaRate` fresh every year rather than caching it once, unlike
`HsaAccount`'s one-time amortized-drawdown calculation (which still
correctly uses `baseSp500Rate`, unaffected by any of this). Confirmed on
the real config: pairing inflation to bad-market years raised the
insolvency rate materially versus sampling them independently (real
correlated risk that was previously invisible).

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
