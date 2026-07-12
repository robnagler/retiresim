import { RothIra } from './RothIra.js';

// Treated identically to RothIra for this analysis: tax-free
// withdrawals. Ignores HSA-specific rules (qualified-medical-expense
// requirement, ordinary income + penalty on non-qualified withdrawals
// before 65) since they're out of scope here.
export class HsaAccount extends RothIra {
}
