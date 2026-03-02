export type Language = 'tr' | 'de';

export interface Translations {
  appTitle: string;
  login: string;
  register: string;
  email: string;
  password: string;
  loginWithGoogle: string;
  orDivider: string;
  welcomeTitle: string;
  welcomeDesc: string;
  noAccount: string;
  hasAccount: string;
  logout: string;
  dashboard: string;
  accountPlans: string;
  companies: string;
  invoices: string;
  reports: string;
  forms: string;
  bankDocuments: string;
  maliMusavir: string;
  settings: string;
  search: string;
  id: string;
  guvPosten: string;
  programmverbindung: string;
  accountPrefix: string;
  accountCode: string;
  accountDescription: string;
  category: string;
  balanceItem: string;
  detailCard: string;
  selectRow: string;
  totalRows: string;
  loading: string;
  loginError: string;
  registerSuccess: string;
  registerError: string;
  analysisJustification: string;
  createdAt: string;
  language: string;
  profile: string;
  admin: string;
  user: string;
  analyzeWithAI: string;
  aiThinking: string;
  aiAnalysisResult: string;
  uploadInvoice: string;
  analyzeInvoice: string;
  generateCover: string;
  aspectRatio: string;
  generate: string;
  companyInfo: string;
  companyName: string;
  taxNumber: string;
  address: string;
  city: string;
  phone: string;
  companyEmail: string;
  userEmail: string;
  save: string;
  edit: string;
  cancel: string;
  saved: string;
  companyRequired: string;
  noCompanies: string;
  companyDetail: string;
  selectCompany: string;
  deleteCompany: string;
  deleteConfirm: string;
  deleted: string;
  // Invoice translations
  invoiceNumber: string;
  supplier: string;
  invoiceDate: string;
  totalNet: string;
  totalVat: string;
  totalGross: string;
  currency: string;
  status: string;
  pending: string;
  analyzed: string;
  duplicate: string;
  check: string;
  markAsCheck: string;
  deleteInvoice: string;
  duplicateMessage: string;
  noInvoices: string;
  invoiceItems: string;
  description: string;
  quantity: string;
  unitPrice: string;
  vatRate: string;
  vatAmount: string;
  netAmount: string;
  grossAmount: string;
  analyzing: string;
  invoicePreview: string;
  accountMatch: string;
  assignedCode: string;
  turkishDesc: string;
  matchScore: string;
  invoiceContext: string;
  dbAnalysis: string;
  codeJustification: string;
  hgbRef: string;
  taxDimension: string;
  periodicity: string;
  classification: string;
  expenseType: string;
  datevCounter: string;
  selectInvoice: string;
  backToPreview: string;
  items: string;
  header: string;
  uploadDragDrop: string;
  fileSelected: string;
  upload: string;
  noPreview: string;
  // Stats
  invoiceStats: string;
  totalVolume: string;
  averageAmount: string;
  waitingAnalysis: string;
  // Filters
  months: string[];
  recentUploads: string;
  allMonths: string;
  filterYear: string;
  calendarMode: string;
  // Manual Edit
  editAccount: string;
  searchAccountPlaceholder: string;
  manualOverride: string;
  // Settings
  matchingRules: string;
  addRule: string;
  supplierKeyword: string;
  targetAccount: string;
  note: string;
  ruleAdded: string;
  ruleDeleted: string;
  noRules: string;
  subscription: string;
}

export interface AccountRow {
  id: number;
  guv_posten: string | null;
  account_code: string | null;
  account_description: string | null;
  category: string | null;
  balance_item: string | null;
  programmverbindung: string | null;
  account_prefix: string | null;
  analysis_justification: string | null;
  created_at: string | null;
}

export interface Company {
  id: number;
  user_id: string;
  company_name: string;
  tax_number: string | null;
  address: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  created_at: string;
}

export interface Invoice {
  id: string; // uuid
  user_id: string;
  company_id?: string | null;
  invoice_number: string | null;
  supplier_name: string | null;
  invoice_date: string | null;
  total_net: number | null;
  total_vat: number | null;
  total_gross: number | null;
  currency: string | null;
  file_url: string | null;
  file_type: string | null;
  status: 'pending' | 'analyzed' | 'error' | 'duplicate' | 'check';
  created_at: string;
}

export interface InvoiceItem {
  id: string; // uuid
  invoice_id: string;
  description: string | null;
  quantity: number | null;
  unit_price: number | null;
  vat_rate: number | null;
  vat_amount: number | null;
  net_amount: number | null;
  gross_amount: number | null;
  account_code: string | null;
  account_name: string | null;
  account_name_tr: string | null;
  match_score: number | null;
  match_justification: string | null;
  hgb_reference: string | null;
  tax_note: string | null;
  period_note: string | null;
  expense_type: string | null;
  datev_counter_account: string | null;
  match_source: string | null;
}

export interface MatchingRule {
  id: string;
  supplier_keyword: string;
  account_code: string;
  account_name: string;
  note: string;
}

export interface UserSettings {
  id: string;
  user_id: string;
  company: Record<string, any>;
  accounting: Record<string, any>;
  rules: MatchingRule[];
  updated_at: string;
}

export type MenuKey = 'dashboard' | 'accountPlans' | 'companies' | 'invoices' | 'reports' | 'forms' | 'bankDocuments' | 'settings' | 'adminView' | 'subscription' | 'maliMusavir';

export interface UserProfile {
  id: string;
  role: 'admin' | 'user';
}