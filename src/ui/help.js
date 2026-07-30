// Every form field's explanatory text, in one place rather than spread
// through index.html's markup -- app.js generates the [?] buttons from
// this map, so adding a field without explaining it is a test failure
// (test/ui/help.test.js reads index.html and checks both directions).
//
// The keys are element ids for fields on the form itself. Per-account
// fields live in accountTypes.js instead, since which of them exist
// depends on the type of account being edited.
// Text is plain prose, no markup: it's set via textContent, so a stray
// angle bracket can't turn into HTML.
export const FIELD_HELP = {
    birthYear: 'Drives everything age-based: when Social Security can start, when Medicare premiums begin at 65, when required minimum distributions kick in, and how long the simulation runs.',
    monthlySalary: 'Gross employment income per month, before taxes. Leave blank if already retired. It stops in the retirement year below.',
    socialSecurityAt67: 'Your monthly benefit at full retirement age (67), not the amount at the age you plan to claim -- the simulator applies the roughly 8% per year adjustment itself, and searches for the best claiming age.',
    medicarePartG: 'Monthly premium for a Medigap Plan G supplement, which private insurers sell to cover what Medicare itself does not. Medicare Part B and Part D are included automatically at their standard amounts. Leave blank to use the same value as Part B.',
    lifeExpectancy: 'The age the simulation runs to. This is a planning horizon, not a prediction -- planning to a longer age is the conservative choice, since outliving the money is the risk that matters.',
    retirementYear: 'The year employment income stops. Spending, Medicare, and taxes continue regardless.',
    monthlySpending: 'What you spend in a month in today\'s dollars, excluding the mortgage payment and Medicare premiums, which are counted separately. It grows with inflation. Health insurance before age 65 belongs here.',
    inflation: 'Annual rate for growing spending, tax brackets, Medicare premiums, and Social Security cost-of-living increases.',
    interestRate: 'What idle cash earns. Cash awaiting spending earns half this rate, since it sits somewhere lower-yield than an invested account.',
    investmentReturn: 'Expected annual return on invested balances. A single steady rate here is optimistic by nature -- real markets do not deliver the average every year, which is what the robustness check is for.',
};
