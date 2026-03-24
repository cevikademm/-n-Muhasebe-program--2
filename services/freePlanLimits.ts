// ─── Free Plan Limits ─────────────────────────────────────────
// Ücretsiz kullanıcılar için sınırlar

export const FREE_PLAN_LIMITS = {
  maxInvoices: 10,
  maxBankStatements: 1,
};

const LS_KEY_INVOICES = "fibu_free_invoice_count";
const LS_KEY_BANK = "fibu_free_bank_count";

function getKey(base: string, userId?: string) {
  return userId ? `${base}_${userId}` : base;
}

// ── Invoice counter ──
export function getInvoiceCount(userId?: string): number {
  try {
    return parseInt(localStorage.getItem(getKey(LS_KEY_INVOICES, userId)) || "0", 10);
  } catch { return 0; }
}

export function incrementInvoiceCount(userId?: string): number {
  const count = getInvoiceCount(userId) + 1;
  localStorage.setItem(getKey(LS_KEY_INVOICES, userId), String(count));
  return count;
}

export function getRemainingInvoices(userId?: string): number {
  return Math.max(0, FREE_PLAN_LIMITS.maxInvoices - getInvoiceCount(userId));
}

export function canUploadInvoice(plan: string, userId?: string): boolean {
  if (plan !== "free") return true;
  return getInvoiceCount(userId) < FREE_PLAN_LIMITS.maxInvoices;
}

// ── Bank statement counter ──
export function getBankStatementCount(userId?: string): number {
  try {
    return parseInt(localStorage.getItem(getKey(LS_KEY_BANK, userId)) || "0", 10);
  } catch { return 0; }
}

export function incrementBankStatementCount(userId?: string): number {
  const count = getBankStatementCount(userId) + 1;
  localStorage.setItem(getKey(LS_KEY_BANK, userId), String(count));
  return count;
}

export function getRemainingBankStatements(userId?: string): number {
  return Math.max(0, FREE_PLAN_LIMITS.maxBankStatements - getBankStatementCount(userId));
}

export function canUploadBankStatement(plan: string, userId?: string): boolean {
  if (plan !== "free") return true;
  return getBankStatementCount(userId) < FREE_PLAN_LIMITS.maxBankStatements;
}

// ── Feature gates ──
export function canUseRules(plan: string): boolean {
  return plan !== "free";
}

export function canUseExport(plan: string): boolean {
  return plan !== "free";
}
