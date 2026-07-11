### Financial tools

#### Assumptions

Modeling decisions and scope limits that are deliberate, not bugs:

* Income never exceeds spending in this analysis. `Cash.produce()` only
  covers a shortfall by drawing down `withdrawalOrder` accounts; it has
  no logic to sweep a surplus into an asset account. Idle cash simply
  carries over to the next year. Reinvesting a surplus would require
  deciding an allocation across Roth vs Traditional IRA vs taxable,
  which is out of scope for the current scenario.

#### License

License: https://www.apache.org/licenses/LICENSE-2.0.html

Copyright (c) 2026 Robert Nagler.  All Rights Reserved.
