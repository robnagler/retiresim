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

The [wiki](https://github.com/robnagler/retiresim/wiki) explains how the
model works, what the optimizer searches, how to read the robustness
check, and every simplification it makes.

`CLAUDE.md` has the architecture writeup and the history behind most
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

The historical figures behind the defaults -- Social Security COLA by
year, the IRMAA thresholds since 2007, and which thresholds track
inflation and which deliberately do not -- live on the
[Reference data](https://github.com/robnagler/retiresim/wiki/Reference-data)
wiki page, with sources.

## License

License: https://www.apache.org/licenses/LICENSE-2.0.html

Copyright (c) 2026 Robert Nagler.  All Rights Reserved.
