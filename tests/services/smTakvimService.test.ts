import { describe, it, expect } from "vitest";
import { ayAraligi, gunAnahtari, gunlereBol } from "../../services/sosyal/smTakvimService";
import type { SmTakvimOgesi } from "../../services/sosyal/types";

const oge = (id: string, tarih: string): SmTakvimOgesi => ({
  id, kaynak: "yayin", tarih, baslik: id, platform: "instagram",
  durum: "yayinlandi", renk: "#10b981", url: null, gerceklesti: true,
});

describe("ayAraligi", () => {
  it("ayın ilk anını ve son anını kapsar", () => {
    const { bas, bit } = ayAraligi(2026, 6); // Temmuz (0 tabanlı)
    expect(new Date(bas).getDate()).toBe(1);
    expect(new Date(bas).getMonth()).toBe(6);
    // Temmuz 31 gün
    expect(new Date(bit).getDate()).toBe(31);
    expect(new Date(bit).getMonth()).toBe(6);
  });

  it("şubatın uzunluğunu takvimden alır (artık yıl)", () => {
    expect(new Date(ayAraligi(2028, 1).bit).getDate()).toBe(29);
    expect(new Date(ayAraligi(2026, 1).bit).getDate()).toBe(28);
  });

  it("aralık → ocak geçişinde yılı taşırmaz", () => {
    const { bit } = ayAraligi(2026, 11);
    expect(new Date(bit).getFullYear()).toBe(2026);
    expect(new Date(bit).getMonth()).toBe(11);
  });
});

describe("gunAnahtari", () => {
  it("YEREL güne göre anahtar üretir", () => {
    // Yerel saatle kurulan tarih, aynı yerel günü döndürmeli — takvim
    // hücreleri UTC'ye göre değil kullanıcının gününe göre dolar.
    const d = new Date(2026, 6, 23, 23, 30);
    expect(gunAnahtari(d)).toBe("2026-07-23");
  });

  it("ay ve günü iki haneye tamamlar", () => {
    expect(gunAnahtari(new Date(2026, 0, 5, 12))).toBe("2026-01-05");
  });
});

describe("gunlereBol", () => {
  it("öğeleri gün kovalarına ayırır", () => {
    const a = new Date(2026, 6, 23, 10).toISOString();
    const b = new Date(2026, 6, 23, 18).toISOString();
    const c = new Date(2026, 6, 24, 9).toISOString();

    const kovalar = gunlereBol([oge("a", a), oge("b", b), oge("c", c)]);
    expect(Object.keys(kovalar).sort()).toEqual(["2026-07-23", "2026-07-24"]);
    expect(kovalar["2026-07-23"]).toHaveLength(2);
    expect(kovalar["2026-07-24"]).toHaveLength(1);
  });

  it("tarihi olmayan öğeyi atlar", () => {
    expect(Object.keys(gunlereBol([oge("x", "")]))).toEqual([]);
  });
});
