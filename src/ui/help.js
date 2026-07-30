// Every form field's explanatory text, in one place rather than spread
// through index.html's markup -- app.js generates the [?] buttons from
// this map, so adding a field without explaining it is a test failure
// (test/ui/help.test.js reads index.html and checks both directions).
//
// The keys are element ids, matching readForm()/populateForm()'s naming.
// Text is plain prose, no markup: it's set via textContent, so a stray
// angle bracket can't turn into HTML.
export const FIELD_HELP = {
    birthYear: 'Drives everything age-based: when Social Security can start, when Medicare premiums begin at 65, when required minimum distributions kick in, and how long the simulation runs.',
    salary: 'Gross annual employment income, before taxes. Leave blank if already retired. It stops in the retirement year below.',
    socialSecurityAt67: 'Your monthly benefit at full retirement age (67), not the amount at the age you plan to claim -- the simulator applies the roughly 8% per year adjustment itself, and searches for the best claiming age.',
    medicarePartG: 'Monthly Medigap Plan G premium. Part B and Part D are included automatically at their standard amounts. Leave blank to use the same value as Part B.',
    mortgageBalance: 'Amount still owed, not the home value. The house itself is not modeled as an asset, so home equity does not count toward net worth.',
    mortgageRate: 'The loan\'s own fixed annual rate. The monthly payment is derived from the balance, this rate, and the end year -- you do not enter the payment.',
    mortgageEndYear: 'The year the loan is scheduled to be paid off. The payment is sized so the balance reaches zero exactly then.',
    taxableBalance: 'Brokerage or bank money that is not in a retirement account. Withdrawals here are taxed only on the gain, at long-term capital gains rates.',
    traditionalIraBalance: 'Pre-tax retirement money, including a 401(k). Every withdrawal counts as ordinary income, and required minimum distributions force withdrawals later in life.',
    rothIraBalance: 'After-tax retirement money. Withdrawals are tax-free and there are no required minimum distributions, which makes it the most flexible account to draw from.',
    inheritedIraBalance: 'An IRA inherited from someone other than a spouse. It has its own withdrawal rules and, under current law, generally must be emptied within ten years.',
    inheritedIraYear: 'The year it was inherited, which starts the clock on those withdrawal rules.',
    hsaBalance: 'Health savings account money. It is spent down on a schedule for medical costs over your lifetime, and is never used to cover ordinary shortfalls.',
    lifeExpectancy: 'The age the simulation runs to. This is a planning horizon, not a prediction -- planning to a longer age is the conservative choice, since outliving the money is the risk that matters.',
    retirementYear: 'The year employment income stops. Spending, Medicare, and taxes continue regardless.',
    yearlySpending: 'What you spend in a year in today\'s dollars, excluding the mortgage payment and Medicare premiums, which are counted separately. It grows with inflation. Health insurance before age 65 belongs here.',
    inflation: 'Annual rate for growing spending, tax brackets, Medicare premiums, and Social Security cost-of-living increases.',
    interestRate: 'What idle cash earns. Cash awaiting spending earns half this rate, since it sits somewhere lower-yield than an invested account.',
    investmentReturn: 'Expected annual return on invested balances. A single steady rate here is optimistic by nature -- real markets do not deliver the average every year, which is what the robustness check is for.',
};
