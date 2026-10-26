// lib/alertTypes.js (bot Discord — CommonJS)
// Liste centralisée des 55 types d'alerte Vikidia, en français.
// FR (8) + EN (6) + ES (5) + 12 nouvelles langues (3 chacune : RC, blocage, rôle).

const LANGUAGES = [
  { code: "fr",  label: "🇫🇷 Français" },
  { code: "en",  label: "🇬🇧 English" },
  { code: "es",  label: "🇪🇸 Español" },
  { code: "oc",  label: "Occitan" },
  { code: "it",  label: "🇮🇹 Italiano" },
  { code: "ru",  label: "🇷🇺 Русский" },
  { code: "de",  label: "🇩🇪 Deutsch" },
  { code: "hy",  label: "🇦🇲 Հայերեն" },
  { code: "el",  label: "🇬🇷 Ελληνικά" },
  { code: "ca",  label: "Català" },
  { code: "pt",  label: "🇵🇹 Português" },
  { code: "ar",  label: "🇸🇦 العربية" },
  { code: "eu",  label: "Euskara" },
  { code: "scn", label: "Sicilianu" },
  { code: "uk",  label: "🇺🇦 Українська" },
];

const ALERT_TYPES = [
  // ---- FR ----
  { value: "fr_alerte",  label: "🚨 FR - Demande de blocage" },
  { value: "fr_si",      label: "🗑️ FR - Suppression immédiate" },
  { value: "fr_vote",    label: "🗳️ FR - Vote à traiter" },
  { value: "fr_ticket",  label: "🎫 FR - Ticket en attente" },
  { value: "fr_da",      label: "🛠️ FR - Demande aux administrateurs" },
  { value: "fr_rc",      label: "📈 FR - RC" },
  { value: "fr_rc_vandalism",      label: "🚨 FR - Vandalisme probable" },
  { value: "fr_blocage", label: "🚫 FR - Blocage d'utilisateur" },
  { value: "fr_role",    label: "🔧 FR - Changement de rôle" },

  // ---- EN ----
  { value: "en_si",      label: "🗑️ EN - Speedy Delete" },
  { value: "en_da",      label: "🛠️ EN - Admin requests" },
  { value: "en_del",     label: "🗑️ EN - Deletion request" },
  { value: "en_rc",      label: "📈 EN - RC" },
  { value: "en_rc_vandalism",      label: "🚨 EN - Vandalisme probable" },
  { value: "en_blocage", label: "🚫 EN - Blocage d'utilisateur" },
  { value: "en_role",    label: "🔧 EN - Changement de rôle" },

  // ---- ES ----
  { value: "es_si",      label: "🗑️ ES - Borrado inmediato (Borrar)" },
  { value: "es_da",      label: "🛠️ ES - Solicitudes" },
  { value: "es_rc",      label: "📈 ES - RC" },
  { value: "es_rc_vandalism",      label: "🚨 ES - Vandalisme probable" },
  { value: "es_blocage", label: "🚫 ES - Blocage d'utilisateur" },
  { value: "es_role",    label: "🔧 ES - Changement de rôle" },
];

// 12 nouvelles langues : uniquement RC + blocages + rôles (pas de SI/DA)
const NOUVELLES_LANGUES = ["oc", "it", "ru", "de", "hy", "el", "ca", "pt", "ar", "eu", "scn", "uk"];
const LABEL_PAR_CODE = Object.fromEntries(LANGUAGES.map((l) => [l.code, l.label]));

for (const code of NOUVELLES_LANGUES) {
  const nom = LABEL_PAR_CODE[code] || code.toUpperCase();
  ALERT_TYPES.push(
    { value: `${code}_rc`,      label: `📈 ${nom} - RC` },
    { value: `${code}_rc_vandalism`,      label: `🚨 ${nom} - Vandalisme probable` },
    { value: `${code}_blocage`, label: `🚫 ${nom} - Blocage d'utilisateur` },
    { value: `${code}_role`,    label: `🔧 ${nom} - Changement de rôle` },
  );
}

// Regroupement par langue : indispensable pour le menu Discord en cascade,
// car un select menu Discord est limité à 25 options et on en a 55 au total.
const ALERT_TYPES_BY_LANG = {};
for (const lang of LANGUAGES) {
  ALERT_TYPES_BY_LANG[lang.code] = {
    label: lang.label,
    types: ALERT_TYPES.filter((t) => t.value.startsWith(`${lang.code}_`)),
  };
}

const NTFY_SERVER_DEFAUT = "https://ntfy.sh";

function genererTopicAleatoire() {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let out = "vikidia-";
  for (let i = 0; i < 24; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

module.exports = {
  LANGUAGES,
  ALERT_TYPES,
  ALERT_TYPES_BY_LANG,
  NTFY_SERVER_DEFAUT,
  genererTopicAleatoire,
};
