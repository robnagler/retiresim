// What kinds of account the form can create, and what each one needs
// beyond a name and a balance. One table drives three things that would
// otherwise drift apart: the menu of types you can add, the fields the
// editing dialog shows, and the help behind each [?].
//
// The keys are the class names buildConfigData puts on the entry it
// builds, so adding a type here and a case in that file's ACCOUNT_FIELDS
// is the whole of adding a new kind of account to the UI.
//
// Mortgage is here despite being a spender rather than something to
// withdraw from, and a liability rather than an asset: to someone filling
// in the form it is a balance you open a box and edit, the same as the
// rest. Its balance is entered positive and stored negative.
export const ACCOUNT_TYPES = {
    TaxableAccount: {
        label: 'Taxable account',
        help: 'A brokerage or bank account that is not a retirement account. Withdrawals are taxed only on the gain, at long-term capital gains rates.',
        fields: [],
    },
    TraditionalIra: {
        label: 'Traditional IRA',
        help: 'Pre-tax retirement money, including a 401(k). Every withdrawal counts as ordinary income, and required minimum distributions force withdrawals later in life.',
        fields: [],
    },
    RothIra: {
        label: 'Roth IRA',
        help: 'After-tax retirement money. Withdrawals are tax-free and there are no required minimum distributions, which makes it the most flexible account to draw from.',
        fields: [],
    },
    NonSpousalInheritedIra: {
        label: 'Inherited IRA',
        help: 'An IRA inherited from someone other than a spouse. It has its own withdrawal rules and, under current law, generally must be emptied within ten years.',
        fields: [{
            key: 'inheritedYear',
            label: 'Inherited year',
            kind: 'year',
            help: 'The year it was inherited, which starts the clock on those withdrawal rules.',
        }],
    },
    HsaAccount: {
        label: 'HSA',
        help: 'Health savings account money. It is spent down on a schedule for medical costs over your lifetime, and is never used to cover ordinary shortfalls.',
        fields: [],
    },
    Mortgage: {
        label: 'Mortgage',
        help: 'What you still owe, not what the home is worth. The house is not modeled as an asset, so home equity does not count toward net worth.',
        fields: [
            {
                key: 'rate',
                label: 'Rate (%)',
                kind: 'percent',
                help: 'The loan\'s own fixed annual rate. The payment is derived from the balance, this rate, and the payoff year -- you do not enter the payment.',
            },
            {
                key: 'endYear',
                label: 'Payoff year',
                kind: 'year',
                help: 'The year the loan is scheduled to be paid off. The payment is sized so the balance reaches zero exactly then.',
            },
        ],
    },
};

// Every account carries these two, so they are not repeated in each type's
// fields above. Balance is the amount owed for a Mortgage and the amount
// held for everything else, which its per-type help explains.
export const ACCOUNT_COMMON_FIELDS = [
    {
        key: 'name',
        label: 'Name',
        kind: 'text',
        help: 'What to call this account in the results and on the chart. Any two accounts need different names.',
    },
    {
        key: 'balance',
        label: 'Balance',
        kind: 'money',
        help: 'What the account holds today. A mortgage is what you still owe.',
    },
];

// A name that is not already taken, for a newly added box: the plain type
// label first, then the label numbered, since two accounts sharing a name
// would have one silently shadow the other (buildConfigData throws on it).
export function defaultAccountName(type, existingNames) {
    const label = ACCOUNT_TYPES[type].label;
    if (!existingNames.includes(label)) {
        return label;
    }
    for (let i = 2; ; i++) {
        if (!existingNames.includes(`${label} ${i}`)) {
            return `${label} ${i}`;
        }
    }
}
