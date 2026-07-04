export class Bookkeeper {
  constructor() {
    this.journal = [];
  }

  post(journalEntry) {
    this.journal.push(journalEntry);
  }

  balanceChange(account, year) {
    return this.journal
      .filter((j) => j.year === year)
      .flatMap((j) => j.postings)
      .filter((p) => p.account === account)
      .reduce((s, p) => s + p.amount, 0);
  }

  reconcile(year, accounts) {
    const checkAccount = (name, account) => {
      const e = this.balanceChange(name, year);
      const a = account.endingBalance - account.beginningBalance;
      if (Math.abs(e - a) <= 0.005) {
        return;
      }
      throw new Error(
        `account=${name} year=${year} ledgerChange=${e} accountChange=${a} ` +
        `beginningBalance=${account.beginningBalance} endingBalance=${account.endingBalance}`
      );
    };
    for (const [name, account] of Object.entries(accounts)) {
      checkAccount(name, account);
    }
  }
}
