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

#### License

License: https://www.apache.org/licenses/LICENSE-2.0.html

Copyright (c) 2026 Robert Nagler.  All Rights Reserved.
