# Retirement Simulator

Once you retire, the money has to come from somewhere, and the order you
take it in changes how much of it you keep. Spending a taxable account
first leaves more in the accounts that grow tax-free, but realizes capital
gains now. Draining a traditional IRA early raises this year's tax bill
and next year's Medicare premium, yet leaves a smaller balance for the
required distributions that arrive whether you want them or not. Claiming
Social Security at 70 pays much more per month than claiming at 62 -- if
you can afford the eight years in between.

This simulates all of that, year by year, and then searches for the
answers.

**What it does.** You describe what you have (account balances, a
mortgage, salary, expected Social Security) and what you expect (how long
to plan for, when to retire, yearly spending, inflation and market
assumptions). It then runs your finances forward to the age you choose:
accounts grow, the mortgage amortizes, required minimum distributions come
out on schedule, Social Security starts when claimed, and each year's
federal, Colorado, capital gains, and Social Security taxes are computed
along with Medicare premiums and their income-based surcharge. On top of
that simulation it searches for a plan whose money lasts the whole way --
which accounts to draw down in which order, how much to take from each
before the tax cost outweighs the benefit, and how long to delay Social
Security. A plan that runs out at any point is discarded outright, however
good it looks up to that year; among the plans that survive, it prefers the
one with the most left over. Finally, it can stress-test the winning plan against sampled
real market history to show how often it survives.

**What it does not do.** It is not financial advice, it models a single
filer in one state, and it cannot tell you what markets will do. A plan
that looks good under a steady 7% return is a plan under one assumption,
which is exactly why the robustness check exists.

Financial correctness takes priority over optimization -- every simulated
year has to reconcile exactly before any optimizer result is trusted.

Plain JavaScript, no build step, no bundler. Runs as a CLI (Node) or as a
static HTML/JS page in a browser. Nothing is uploaded anywhere; the
browser version keeps your figures on your own machine.

## Running it

**Tests** (run these first -- everything below assumes they pass):

```
node --test
```
or
```
bash test.sh
```

**Command line**, from the repo root:

```
node src/cli/main.js                      # illustrative example scenario
node src/cli/main.js config/cfg.json       # your real config (see below)
node src/cli/main.js --debug [config.json] # one scenario, full year-by-year detail, no optimizing
node src/cli/main.js --robustness [N] [config.json]  # stress-test against N random historical-return sequences
```

With no `--debug`/`--robustness` flag, `main.js` always runs the optimizer
and prints a candidate/net-worth table per search variable.

**Browser UI**, from the repo root:

```
python -m http.server
```

then open `http://localhost:8000/index.html`. Fill in the form and click
Optimize. Export/Import buttons save and reload just the form's fields as
JSON.

**Your real data**: create `config/cfg.json` (gitignored, never
committed) with your actual balances, income, and spending -- see any
`src/biz/*.js` class for the fields it reads, or just use the browser UI,
which builds this shape for you automatically.

## How it's organized

- `src/biz/` -- the simulation/domain logic (accounts, taxes, the
  optimizer itself). Pure, no console output, no DOM.
- `src/cli/` -- the command-line entry point and its console reporting.
- `src/ui/` -- the browser form, chart, and config-building glue.
- `src/ext/` -- vendored third-party code, the only such code in the repo:
  Chart.js (MIT), so the UI loads no CDN and works offline.
- `test/` -- one test file per `src/` module, mirroring that same layout.

`CLAUDE.md` has the full architecture writeup and the history behind most
non-obvious design decisions -- written densely, as project-context
reference material rather than a narrative to read start to finish.

## Assumptions

Modeling decisions and scope limits that are deliberate, not bugs:

* `NonSpousalInheritedIra`'s 2020-and-later branch (the SECURE Act's
  10-year rule) withdraws a level, straight-line amount each year
  (`balance / yearsRemaining`) rather than modeling the "at least as
  fast" requirement -- annual life-expectancy RMDs in years 1-9 plus
  full distribution by year 10 -- that applies when the original owner
  had already reached their required beginning date before death. The
  straight-line amount always exceeds that annual minimum, so this
  stays compliant, just not necessarily tax-optimal (e.g. deferring to
  a minimum each year and taking a lump sum in year 10 instead).
  Choosing between withdrawal strategies is an optimization question,
  deferred to the future Optimizer module rather than modeled now.

## Reference data

Historical Social Security COLA by year (SSA, 1996-2025) -- background for
the `cola` value set on `config/cfg.json`'s `SocialSecurity` entry:

| Year | COLA | Year | COLA | Year | COLA |
|---|---|---|---|---|---|
| 1996 | 2.6% | 2006 | 4.1% | 2016 | 0.0% |
| 1997 | 2.9% | 2007 | 3.3% | 2017 | 0.3% |
| 1998 | 2.1% | 2008 | 2.3% | 2018 | 2.0% |
| 1999 | 1.3% | 2009 | 5.8% | 2019 | 2.8% |
| 2000 | 2.5% | 2010 | 0.0% | 2020 | 1.6% |
| 2001 | 3.5% | 2011 | 0.0% | 2021 | 1.3% |
| 2002 | 2.6% | 2012 | 3.6% | 2022 | 5.9% |
| 2003 | 1.4% | 2013 | 1.7% | 2023 | 8.7% |
| 2004 | 2.1% | 2014 | 1.5% | 2024 | 3.2% |
| 2005 | 2.7% | 2015 | 1.7% | 2025 | 2.5% |

30-year average: ~2.53%, close to the `0.025` default -- but individual
years swing widely (two 0% years, a 2021-2023 inflation spike up to
8.7%), so this is a long-run average assumption, not a guarantee.

Sources: [Fool.com COLA history](https://www.fool.com/retirement/social-security/cola-history/),
[AARP COLA history](https://www.aarp.org/social-security/cola-history/).

Historical Medicare IRMAA first-tier MAGI threshold by year (single filer,
CMS, 2007-2026) -- background for `Medicare.js`'s `IRMAA_BRACKETS` table,
whose `upTo` boundaries now grow with `inflationRate` every year (surcharge
dollar amounts stay fixed as configured):

| Year | Threshold | Year | Threshold |
|---|---|---|---|
| 2007 | $80,000 | 2017 | $85,000 |
| 2008 | $82,000 | 2018 | $85,000 |
| 2009 | $85,000 | 2019 | $85,000 |
| 2010 | $85,000 | 2020 | $87,000 |
| 2011 | $85,000 | 2021 | $88,000 |
| 2012 | $85,000 | 2022 | $91,000 |
| 2013 | $85,000 | 2023 | $97,000 |
| 2014 | $85,000 | 2024 | $103,000 |
| 2015 | $85,000 | 2025 | $106,000 |
| 2016 | $85,000 | 2026 | $109,000 |

IRMAA has only existed since 2007 (Medicare Modernization Act of 2003,
effective 2007), so there is no 30-year history to show. Two distinct eras:
completely frozen at $85,000 for 2009-2019 (11 years, no adjustment at
all), then indexed to chained CPI from 2020 onward and growing faster,
especially 2022-2024 (~6-6.5%/year). Overall $80k-to-$109k over 19 years is
about 1.6%/year average -- below this project's 2.5% `inflationRate`
default, so growing the threshold at `inflationRate` is directionally
correct (better than never moving at all) but likely runs a bit faster
than the real, historically-frozen-then-indexed pattern would suggest.

Sources: [History of IRMAA Brackets by Year (2007-2025) - IRMAA Solutions](https://www.irmaasolutions.com/history-of-irmaa-brackets),
[Medicare IRMAA Surcharge History (2007-2026) - PennyCalc](https://pennycalc.com/medicare-irmaa-brackets/history/).

**Which fixed thresholds should track inflation, and which shouldn't.**
Besides IRMAA, three other constants in `TaxCalculator.js` are dollar
thresholds that stay fixed for the whole simulation: `federalBrackets`
(the 10%/12%/22% ordinary-income bracket boundaries), `ltcgBrackets` (the
0%/15%/20% capital-gains bracket boundaries), and `standardDeduction`. All
three *are* inflation-indexed annually in real life -- the IRS publishes
new numbers every year via chained CPI, the same mechanism IRMAA has used
since 2020 -- so they have the same "gets easier to cross over decades"
issue IRMAA had, and now grow at `inflationRate` the same way (see
`TaxCalculator.prepareNextYear()`).

One threshold is correctly left fixed, not a simplification worth fixing:
`ssProvisionalIncomeThresholds` ($32k/$44k, the Social Security taxability
thresholds). Unlike IRMAA or the tax brackets, these have never been
inflation-adjusted since being enacted in the 1980s/90s -- Congress simply
never indexed them. Leaving them flat forever is the historically accurate
choice.

Not comparable at all: the RMD life-expectancy tables and the 72/73/75 RMD
start-age rule (actuarial/legal, not dollar-denominated) and `Mortgage`'s
own `rate` (a fixed loan term, unrelated to `Economy`).

## License

License: https://www.apache.org/licenses/LICENSE-2.0.html

Copyright (c) 2026 Robert Nagler.  All Rights Reserved.
