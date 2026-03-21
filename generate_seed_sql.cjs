const fs = require("fs");
const path = require("path");

const fullContent = fs.readFileSync(path.join(__dirname, "data", "skr03Full.ts"), "utf-8");
const metaContent = fs.readFileSync(path.join(__dirname, "data", "skr03Metadata.ts"), "utf-8");

const accounts = [];
const re = /\{\s*code:\s*['"](\d+)['"]\s*,\s*name:\s*['"]([^'"]*)['"]\s*,\s*funktion:\s*['"]([^'"]*)['"]\s*,\s*abschlusszweck:\s*['"]([^'"]*)['"]/g;
let m;
while ((m = re.exec(fullContent)) !== null) {
  accounts.push({ code: m[1], name: m[2], funktion: m[3], abschlusszweck: m[4], klasse: m[1].charAt(0) });
}

const metadata = {};
const mre = /'(\d+)':\s*\{[^}]*description:\s*'([^']*)'[^}]*keywords:\s*\[([^\]]*)\][^}]*kategorie:\s*'([^']*)'/g;
while ((m = mre.exec(metaContent)) !== null) {
  const kws = (m[3].match(/'([^']*)'/g) || []).map(k => k.replace(/'/g, "")).slice(0, 5);
  metadata[m[1]] = { desc: m[2], kws, kat: m[4] };
}

const esc = (s) => (s || "").replace(/'/g, "''");

let sql = "DELETE FROM account_plans WHERE true;\n\n";

for (const acc of accounts) {
  const meta = metadata[acc.code];
  let just = meta ? meta.desc : "";
  if (meta && meta.kws.length) just += " [" + meta.kws.join(", ") + "]";
  if (meta && meta.kat) just += " (Kat: " + meta.kat + ")";

  sql += `INSERT INTO account_plans (account_code, account_description, category, analysis_justification, account_prefix, programmverbindung, balance_item) VALUES ('${esc(acc.code)}', '${esc(acc.name)}', '${esc(meta ? meta.kat : "Klasse " + acc.klasse)}', '${esc(just)}', '${esc(acc.klasse)}', '${esc(acc.funktion)}', '${esc(acc.abschlusszweck)}');\n`;
}

fs.writeFileSync(path.join(__dirname, "seed_accounts.sql"), sql);
console.log(accounts.length + " satir SQL olusturuldu -> seed_accounts.sql");
