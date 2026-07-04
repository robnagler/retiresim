export class Account {
  constructor({ balance }) {
    this.balance = balance;
  }

  grow(rate) {
    this.balance += this.balance * rate;
    return this.balance;
  }

  deposit(amount) {
    this.balance += amount;
    return this.balance;
  }

  withdraw(amount) {
    const checkSufficient = () => {
      if (amount <= this.balance) {
        return;
      }
      throw new Error(
        `account=${this.constructor.name} amount=${amount} balance=${this.balance}`
      );
    };
    checkSufficient();
    this.balance -= amount;
    return this.balance;
  }
}
