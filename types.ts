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
  subscription: string;
  invoices: string;
  about: string;
  deliveryReturn: string;
  privacy: string;
  distanceSelling: string;
  sslCertificate: string;
  isoCertificate: string;
  gdprCompliant: string;
  gobdCompliant: string;
  certificates: string;
  notifications: string;
  unread: string;
  allRead: string;
  markAllAsRead: string;
  noNotifications: string;
  unmatchedInfo: string;
  read: string;
  dismiss: string;
  autoNotifInfo: string;
  justNow: string;
  minsAgo: string;
  hoursAgo: string;
  daysAgo: string;
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
  id: string;
  user_id: string;
  fatura_no: string | null;
  tarih: string | null;
  satici_vkn: string | null;
  alici_vkn: string | null;
  ara_toplam: number;
  toplam_kdv: number;
  genel_toplam: number;
  status: string;
  file_url: string | null;
  raw_ai_response: any;
  uyarilar: string[];
  created_at: string;
  [key: string]: any; // eski bilesenlerle geriye uyumluluk
}

export interface InvoiceItem {
  id: string;
  invoice_id: string;
  urun_adi: string;
  miktar: number;
  kdv_orani: number;
  satir_toplami: number;
  created_at: string;
  [key: string]: any; // eski bilesenlerle geriye uyumluluk
}

export interface InvoiceAnalysisResult {
  fatura_bilgileri: {
    fatura_no: string;
    tarih: string;
    satici_vkn: string;
    alici_vkn: string;
  };
  kalemler: {
    urun_adi: string;
    miktar: number;
    kdv_orani: number;
    satir_toplami: number;
  }[];
  finansal_ozet: {
    ara_toplam: number;
    toplam_kdv: number;
    genel_toplam: number;
  };
  uyarilar: string[];
}

export type MatchingRule = Record<string, any>;

export interface UserSettings {
  id: string;
  user_id: string;
  company: Record<string, any>;
  accounting: Record<string, any>;
  rules: any[];
  updated_at: string;
}

export type MenuKey = 'dashboard' | 'accountPlans' | 'hesapPlanlari2' | 'companies' | 'reports' | 'forms' | 'bankDocuments' | 'invoices' | 'settings' | 'adminView' | 'maliMusavir' | 'campaigns' | 'about' | 'deliveryReturn' | 'privacy' | 'distanceSelling';

export interface UserProfile {
  id: string;
  role: 'admin' | 'user';
}