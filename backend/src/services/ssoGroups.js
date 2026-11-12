/**
 * Normalisiert einen SSO-Gruppen-Claim zu einem Array von Gruppennamen (Strings).
 *
 * Unterstützte Provider-Formate:
 *  - Einzelner String:           "lehrer"
 *  - Array von Strings:          ["lehrer", "admins"]
 *  - Array von Objekten:         [{ name: "lehrer" }, { path: "admins" }]
 *  - Objekt-Keyed Map (IServ):   { "0": { id: "12", name: "lehrer" }, "1": "admins" }
 *  - Wrapper-Objekte:            { groups: [...] }, { results: [...] }, { data: [...] }
 *  - Null/undefined/leer:        []
 */
function normalizeSsoGroupClaim(value) {
  if (value === null || value === undefined) return [];

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith('[')) {
      try {
        return normalizeSsoGroupClaim(JSON.parse(trimmed));
      } catch {
        return [trimmed];
      }
    }
    return [trimmed];
  }

  if (Array.isArray(value)) {
    const names = [];
    for (const item of value) {
      if (typeof item === 'string') {
        const trimmed = item.trim();
        if (trimmed) names.push(trimmed);
      } else if (item && typeof item === 'object') {
        const raw = item.name ?? item.path ?? item.group_name ?? item.slug ?? item.id;
        if (raw !== null && raw !== undefined && String(raw).trim()) {
          names.push(String(raw).trim());
        }
      }
    }
    return Array.from(new Set(names));
  }

  if (typeof value === 'object') {
    for (const key of ['groups', 'results', 'data']) {
      if (value[key] !== undefined) return normalizeSsoGroupClaim(value[key]);
    }
    // Objekt-Keyed Map (z. B. {"0": {name: "lehrer"}, ...}) → Werte behandeln
    if (Object.keys(value).length === 0) return [];
    return normalizeSsoGroupClaim(Object.values(value));
  }

  return [];
}

module.exports = { normalizeSsoGroupClaim };