export class JournalEntry {
  constructor({ year, category, postings }) {
    const checkCount = () => {
      if (postings.length === 2) {
        return;
      }
      throw new Error(
        `category=${category} postings=${JSON.stringify(postings)} count=${postings.length} expected=2`
      );
    };
    const checkBalance = () => {
      const t = postings.reduce((s, p) => s + p.amount, 0);
      if (Math.abs(t) <= 0.005) {
        return;
      }
      throw new Error(
        `category=${category} postings=${JSON.stringify(postings)} total=${t} expected=0`
      );
    };
    checkCount();
    checkBalance();
    this.year = year;
    this.category = category;
    this.postings = postings;
  }
}
