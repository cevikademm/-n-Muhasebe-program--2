// ─── Dönemsel Abonelik Yardımcı Fonksiyonları ──────────────────────

export type Language = "tr" | "de";

const MONTH_NAMES_TR = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];

const MONTH_NAMES_DE = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

const MONTH_ABBR_TR = [
  "Oca", "Şub", "Mar", "Nis", "May", "Haz",
  "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara",
];

const MONTH_ABBR_DE = [
  "Jan", "Feb", "Mär", "Apr", "Mai", "Jun",
  "Jul", "Aug", "Sep", "Okt", "Nov", "Dez",
];

/** Mevcut takvim dönemini döndürür: "2026-03" */
export function getCurrentPeriod(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  return `${y}-${String(m).padStart(2, "0")}`;
}

/** "2026-03" → "Mart 2026" veya "März 2026" */
export function formatPeriodLabel(period: string, lang: Language): string {
  const [y, m] = period.split("-").map(Number);
  const names = lang === "tr" ? MONTH_NAMES_TR : MONTH_NAMES_DE;
  return `${names[m - 1]} ${y}`;
}

/** "2026-03" → "Mar" veya "Mär" */
export function formatPeriodAbbr(period: string, lang: Language): string {
  const m = parseInt(period.split("-")[1], 10);
  const abbr = lang === "tr" ? MONTH_ABBR_TR : MONTH_ABBR_DE;
  return abbr[m - 1];
}

/** Ay index (0-11) → Ay ismi */
export function getMonthName(monthIndex: number, lang: Language): string {
  const names = lang === "tr" ? MONTH_NAMES_TR : MONTH_NAMES_DE;
  return names[monthIndex] || "";
}

/** Ay index (0-11) → Kısa ay ismi */
export function getMonthAbbr(monthIndex: number, lang: Language): string {
  const abbr = lang === "tr" ? MONTH_ABBR_TR : MONTH_ABBR_DE;
  return abbr[monthIndex] || "";
}

/** Belirtilen başlangıçtan itibaren count adet dönem üretir */
export function generatePeriods(startYear: number, startMonth: number, count: number): string[] {
  const periods: string[] = [];
  let y = startYear;
  let m = startMonth;
  for (let i = 0; i < count; i++) {
    periods.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return periods;
}

/** Mevcut çeyreğin aylarını döndürür: Q1=[1,2,3], Q2=[4,5,6], vb. */
export function getCurrentQuarterMonths(year: number, month: number): string[] {
  const q = Math.ceil(month / 3);
  const startMonth = (q - 1) * 3 + 1;
  return generatePeriods(year, startMonth, 3);
}

/** Mevcut yılın tüm aylarını döndürür */
export function getYearPeriods(year: number): string[] {
  return generatePeriods(year, 1, 12);
}

/** Çeyrek numarası (1-4) döndürür */
export function getQuarter(month: number): number {
  return Math.ceil(month / 3);
}

/** Çeyrek etiketi: "Q1 2026" / "1. Çeyrek 2026" */
export function getQuarterLabel(year: number, quarter: number, lang: Language): string {
  if (lang === "tr") return `${quarter}. Çeyrek ${year}`;
  return `Q${quarter} ${year}`;
}

/** İki dönemi karşılaştırır: negatif = a önce, pozitif = b önce */
export function comparePeriods(a: string, b: string): number {
  return a.localeCompare(b);
}

/** Dönem mevcut aya eşit mi? */
export function isPeriodCurrent(period: string): boolean {
  return period === getCurrentPeriod();
}

/** Dönem geçmişte mi? */
export function isPeriodPast(period: string): boolean {
  return period < getCurrentPeriod();
}

/** Dönem gelecekte mi? */
export function isPeriodFuture(period: string): boolean {
  return period > getCurrentPeriod();
}

/**
 * Plan tipine göre seçilebilir dönemleri hesaplar.
 * - monthly: sadece mevcut ay
 * - quarterly: mevcut çeyreğin ayları (geçmiş dahil)
 * - yearly: mevcut yılın tüm ayları (geçmiş dahil)
 */
export function getSelectablePeriods(planType: string): string[] {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  switch (planType) {
    case "quarterly":
      return getCurrentQuarterMonths(year, month);
    case "yearly":
      return getYearPeriods(year);
    case "monthly":
    default:
      return [getCurrentPeriod()];
  }
}

/**
 * Aylık abonelerin erişemeyeceği kilitli dönemleri hesaplar.
 * PeriodPicker'da upgrade teşviki için kullanılır.
 */
export function getLockedPastPeriods(planType: string): string[] {
  if (planType !== "monthly") return [];

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const periods: string[] = [];

  // Mevcut yılın geçmiş ayları (mevcut ay hariç)
  for (let m = 1; m < month; m++) {
    periods.push(`${year}-${String(m).padStart(2, "0")}`);
  }
  return periods;
}

/** Satın alınan dönemlerden aktif durumu hesaplar */
export function getPeriodStatus(purchasedPeriods: string[]) {
  const current = getCurrentPeriod();
  const isActive = purchasedPeriods.includes(current);
  const futureAndCurrent = purchasedPeriods.filter(p => p >= current);
  const remainingMonths = futureAndCurrent.length;

  return {
    isActive,
    isExpired: !isActive,
    currentPeriod: current,
    remainingMonths,
    activePeriods: futureAndCurrent.sort(),
  };
}

/** Son satın alınan ayın son gününü Date olarak döndürür (geriye uyumluluk) */
export function getExpiresAtFromPeriods(purchasedPeriods: string[]): Date | null {
  if (purchasedPeriods.length === 0) return null;
  const sorted = [...purchasedPeriods].sort();
  const last = sorted[sorted.length - 1];
  const [y, m] = last.split("-").map(Number);
  // Ayın son günü: bir sonraki ayın 0. günü
  return new Date(y, m, 0, 23, 59, 59);
}
