### Financial tools

#### Assumptions

Modeling decisions and scope limits that are deliberate, not bugs:

* Income never exceeds spending in this analysis. `Cash.produce()` only
  covers a shortfall by drawing down `withdrawalOrder` accounts; it has
  no logic to sweep a surplus into an asset account. Idle cash simply
  carries over to the next year. Reinvesting a surplus would require
  deciding an allocation across Roth vs Traditional IRA vs taxable,
  which is out of scope for the current scenario.

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

#### Reference data

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

#### License

License: https://www.apache.org/licenses/LICENSE-2.0.html

Copyright (c) 2026 Robert Nagler.  All Rights Reserved.
