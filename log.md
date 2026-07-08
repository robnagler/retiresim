# Log

## 2026-07-07

* 19:01:03 **Feedback**: Told to log every prompt going forward, not just backfill history -- every user turn in this project now gets a `log.md` entry with a real timestamp (via the `date` shell command) and the actions taken, including pure discussion turns with no file changes; saved as a project memory (`feedback_log_every_prompt.md`).
* 19:01:03 **Discussion**: Confirmed `log.md` was only a one-time backfill so far, not yet kept current turn-by-turn (in answer to "are you logging everything?").
* 19:01:03 **Discussion**: Confirmed `Account` already looks up its config by the instantiating subclass's own name, not literally "Account" -- `this.constructor` resolves polymorphically at runtime, so `this.constructor.name` is `'Mortgage'`, `'TaxableAccount'`, etc. depending on what was actually constructed.
* 19:01:03 **Update**: Generalized opening balances into Config at the Account base level (not yet committed) -- [src/Account.js](src/Account.js)'s constructor now takes `config` instead of `balance` directly and reads `this.balance` from `config.get(this.constructor.name).balance`; [src/TraditionalIra.js](src/TraditionalIra.js) no longer needs its own constructor; [src/Mortgage.js](src/Mortgage.js) and [src/TaxableAccount.js](src/TaxableAccount.js) updated to pass `config` through (basis stays a direct param for now); all 8 test files updated to build a `Config` with each account's opening balance.
* 18:24:34 **Feedback**: Iterated JournalEntry.js's error messages down to a terse "prose + x=y for observed values only, never expected values, no repeated words, no restated location" style (final: `not two postings=${postings}` and `non-zero sum=${t} postings=${postings}`); saved as a project memory and, at request, also as a global memory under `~/.claude/memory/feedback_error_messages.md` so it applies to any project.
* 18:24:34 **Feedback**: Inlined [src/JournalEntry.js](src/JournalEntry.js)'s two nested check functions (checkCount/checkBalance) directly into the constructor as guard clauses -- "too complicated with functions... reverse tests so early exit."
* 18:24:34 **Update**: Updated [src/TraditionalIra.js](src/TraditionalIra.js) and [test/TraditionalIra.test.js](test/TraditionalIra.test.js) for the new Config shape.
* 18:24:34 **Feedback**: Reworked Config into pure name -> data storage with no method names tied to any module's concepts (`get(name)`, no validation) so each module decides its own config shape and looks itself up by class name (`config.get(this.constructor.name)`).
* 18:24:34 **Creation**: Added [src/Config.js](src/Config.js) and [test/Config.test.js](test/Config.test.js) as a first cut, a `withdrawal(accountName, year)` lookup, then wired it into TraditionalIra's constructor and runYear().
* 18:24:34 **Discussion**: Worked through what "TraditionalIra withdraws something in a year" requires -- a nominal income counter-account to post against (like UnrealizedGrowth/MortgagePrincipalPaid), and a way to specify how much to withdraw in a given year, since withdrawals aren't autonomous like growth or a fixed mortgage payment.
* 17:54:44 **Creation**: Added [src/SecurityAccount.js](src/SecurityAccount.js) (extends TaxableAccount; runYear() is a no-op so it never grows or posts) and [test/SecurityAccount.test.js](test/SecurityAccount.test.js).
* 17:54:44 **Discussion**: Designed SecurityAccount as a fixed-cost-basis holding (basis set once at construction, assumed not to grow, everything treated as LTCG) to track stock sales without full basis-growth bookkeeping.
* 17:54:44 **Creation**: Added [src/TraditionalIra.js](src/TraditionalIra.js) (extends Account, no basis; withdraw() returns `{ balance, income: amount }`) and [test/TraditionalIra.test.js](test/TraditionalIra.test.js).
* 17:54:44 **Discussion**: Deferred tagging withdrawals with a tax "type" (that belongs on JournalEntry.category, posted by whoever calls withdraw(), not on withdraw() itself) in favor of building TraditionalIra first, since its withdrawals are simpler -- the whole amount is ordinary income, no basis tracking.
* 17:47:30 **Creation**: Added [src/TaxableAccount.js](src/TaxableAccount.js) (extends Account; basis tracked via deposit()/withdraw() overrides that keep basis proportional to balance; `_checkBasis()` guards the basis-never-exceeds-balance invariant) and [test/TaxableAccount.test.js](test/TaxableAccount.test.js).
* 17:47:30 **Discussion**: Reviewed the remaining build order and chose to start step 1's remaining Account subclasses with TaxableAccount.
* 17:42:39 **Creation**: Added [test/Simulator.test.js](test/Simulator.test.js) -- a multi-year run over an Account + Mortgage verifying balances and reconciling every year, plus a test that a broken runYear override makes Simulator.run() throw immediately with the failing year. Closed build-order step 4 (end-to-end pure-growth reconciliation).

## 2026-07-04

* 16:00:19 **Feedback**: Renamed Bookkeeper._reconcile's nested parameter from `a` to `account` (parameters get informative names) while keeping the outer loop local `a` (locals stay single-letter); made the same fix in Simulator.run()'s loop.
* 16:00:19 **Update**: Rewrote [test/Bookkeeper.test.js](test/Bookkeeper.test.js) to exercise real Account/Mortgage instances through `bookkeeper.runYear()` instead of fakes.
* 16:00:19 **Update**: Added `runYear()` to [src/Account.js](src/Account.js) (grows by rate, posts a 'growth' JournalEntry) and [src/Mortgage.js](src/Mortgage.js) (pays down principal, posts a 'mortgagePrincipal' JournalEntry).
* 16:00:19 **Update**: Reworked [src/Bookkeeper.js](src/Bookkeeper.js) to own accounts (sorted by priority) and drive `runYear(year)` itself (snapshot -> run each account -> reconcile).
* 16:00:19 **Creation**: Added [src/Simulator.js](src/Simulator.js) (`{ bookkeeper, startYear, endYear }`, `run()` loops `bookkeeper.runYear(year)`).
* 16:00:19 **Discussion**: Redesigned ownership so each Account implements its own runYear() and reports to whichever Bookkeeper it's given; Bookkeeper owns the account list/ordering/reconciliation; Simulator is reduced to a thin multi-year loop.
* 16:00:19 **Feedback**: Fixed a third hand-edit bug in Mortgage.js (`rv.interest:` instead of `rv.interest =`, a syntax error).
* 15:41:09 **Feedback**: Adopted the convention that local variables (including loop/nested-closure locals) are single letters while parameters get descriptive names, and that `rv` is reserved for the return-value variable; reindented to 4 spaces, no tabs.
* 15:41:09 **Feedback**: Fixed two bugs introduced while hand-editing Mortgage.js (missing `const r`, and referencing an undefined `p` instead of the newly-computed `principal`), reproducing each with a failing test before fixing per the bug-fix-needs-reproduction rule.
* 15:41:09 **Creation**: Added [test/Account.test.js](test/Account.test.js) and [test/Mortgage.test.js](test/Mortgage.test.js).
* 15:41:09 **Creation**: Added [src/Mortgage.js](src/Mortgage.js) (extends Account; caches growthFactor/yearlyPayment; makePayment() splits principal/interest).
* 15:41:09 **Update**: Reworked [src/Account.js](src/Account.js), [src/Bookkeeper.js](src/Bookkeeper.js), [src/JournalEntry.js](src/JournalEntry.js), [src/Posting.js](src/Posting.js) to extend Base and use full-context error messages.
* 15:41:09 **Creation**: Added [src/Base.js](src/Base.js) (generic `toString()` dumping all fields) to shorten error messages.
* 15:41:09 **Discussion**: Decided Mortgage should extend Account, using a closed-form fixed-rate amortization formula (monthly compounding, fixed yearly payment) rather than a naive annual approximation or a 12-iteration loop.
* 14:59:51 **Creation**: Added [src/Account.js](src/Account.js) (balance, grow, deposit, withdraw) -- first cut, before Mortgage or runYear existed.
* 14:56:54 **Creation**: Added [test/Bookkeeper.test.js](test/Bookkeeper.test.js) as a bootstrap test, later rewritten to use real accounts.
* 14:56:54 **Creation**: Added [src/Bookkeeper.js](src/Bookkeeper.js) (journal array, `post()`, `balanceChange()`).
* 14:56:54 **Creation**: Added [src/JournalEntry.js](src/JournalEntry.js) (exactly two Postings, validated to sum to zero at construction).
* 14:56:54 **Creation**: Added [src/Posting.js](src/Posting.js) (one side of an entry: account + signed amount).
* 14:56:54 **Discussion**: Agreed on double-entry bookkeeping (two Postings per JournalEntry, must sum to zero) for auditability, and on "class per file until unwieldy."
* 14:56:54 **Update**: Added a "Modularization" section (class list and 8-step build order) to [CLAUDE.md](CLAUDE.md).
* 14:56:54 **Creation**: Added package.json, index.html, .gitignore, and config/.gitignore scaffolding a plain Node project.
* 14:56:54 **Reset**: Wiped and reinitialized the local git repo (`git init --initial-branch=main`) ahead of manually force-pushing a cleared history to GitHub.
* 14:56:54 **Discussion**: Clarified plain-JS/Node conventions (node --test, ES modules, no bundler, no npm deps) after pivoting away from an earlier Python/pykern approach.
* 14:08:08 **Creation**: Added [README.md](README.md) as a placeholder before scaffolding the project.
