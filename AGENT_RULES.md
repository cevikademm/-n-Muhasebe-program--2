# YAPAY ZEKA ASİSTAN KURALLARI (AGENT RULES)

Bu dosya, projede çalışan yapay zeka asistanı için kesin ve ihlal edilemez kuralları içerir.

## ⚠️ GENEL VE EN ÖNEMLİ KURAL ⚠️
**Yapay zeka asistanı, SADECE kullanıcının özel olarak belirttiği ve ondan istediği dosyalarda/alanlarda değişiklik yapacaktır. Kullanıcının talep etmediği, konunun dışında kalan veya "Bunu da düzelteyim" diyerek inisiyatif aldığı HİÇBİR DOSYAYA DOKUNMAYACAK VE DEĞİŞTİRMEYECEKTİR.**

## Kilitli Alanlar (Değiştirilmesi Yasaklı Kodlar)

Kullanıcı ("ben değiştir" diyene kadar) aşağıdaki alanlardaki kodlara, mantığa veya kurallara arka planda veya doğrudan kesinlikle **DOKUNULAMAZ** ve **DEĞİŞTİRİLEMEZ**:

1. **Fatura Analizi Kuralları ve Kodları:** Fatura okuma, ayrıştırma ve kaydetme algoritmalarının bulunduğu tüm veri işleme kısımları.
2. **Banka Ekstresi Kuralları ve Kodları:** Banka hesap özetlerinin okunması, işlenmesi ve analizi ile ilgili tüm mantık ve kurallar.

## Sistem ve Veri Kaynağı Kuralları (Kesin Kurallar)

1. **Fatura Analizi Kaynağı:** Fatura analiz işlemleri kesinlikle Supabase Edge Functions içinde yer alan **`super-worker`** üzerinden gerçekleştirilecektir/gelecektir.
2. **Hesap Planları:** Sistemde kullanılacak olan hesap planları kesinlikle **`hesap planları 2`** de yer alan hesap kodlarını baz alacaktır. Başka bir kaynaktan hesap kodu uydurulmayacak veya kullanılmayacaktır.
3. **Yapay Zeka Modeli:** Fatura analizlerinde `gemini-2.5-flash` modeli kullanılmalıdır.

Asistan, bu sistemlerde (veya kilitli alanlarda) bir değişiklik yapması gerekirse VEYA yapmayı düşünürse, işlemi anında durdurmalı ve **ÖNCE KULLANICIDAN AÇIK ONAY İSTEMELİDİR**.
