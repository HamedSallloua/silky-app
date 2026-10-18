/**
 * Canonical Tunisian Governorates Reference (24 Governorates)
 * Uses authoritative ISO 3166-2:TN codes and canonical names.
 */
export const CANONICAL_GOVERNORATES = [
  { id: 1, name: 'Tunis', code: 'TN-11' },
  { id: 2, name: 'Sousse', code: 'TN-51' },
  { id: 3, name: 'Nabeul', code: 'TN-21' },
  { id: 4, name: 'Ariana', code: 'TN-12' },
  { id: 5, name: 'Manouba', code: 'TN-14' },
  { id: 6, name: 'Monastir', code: 'TN-52' },
  { id: 7, name: 'Mahdia', code: 'TN-53' },
  { id: 8, name: 'Ben Arous', code: 'TN-13' },
  { id: 9, name: 'Bizerte', code: 'TN-23' },
  { id: 10, name: 'Kairouan', code: 'TN-41' },
  { id: 11, name: 'Sfax', code: 'TN-54' },
  { id: 12, name: 'Zaghouan', code: 'TN-22' },
  { id: 13, name: 'Beja', code: 'TN-31' },
  { id: 14, name: 'Gabes', code: 'TN-71' },
  { id: 15, name: 'Gafsa', code: 'TN-61' },
  { id: 16, name: 'Jendouba', code: 'TN-32' },
  { id: 17, name: 'Kasserine', code: 'TN-42' },
  { id: 18, name: 'Kebili', code: 'TN-63' },
  { id: 19, name: 'Kef', code: 'TN-33' },
  { id: 20, name: 'Medenine', code: 'TN-72' },
  { id: 21, name: 'Sidi Bouzid', code: 'TN-43' },
  { id: 22, name: 'Siliana', code: 'TN-34' },
  { id: 23, name: 'Tataouine', code: 'TN-73' },
  { id: 24, name: 'Tozeur', code: 'TN-62' },
];

const BY_ID = new Map();
const BY_NAME = new Map();
const BY_CODE = new Map();

for (const gov of CANONICAL_GOVERNORATES) {
  BY_ID.set(gov.id, gov);
  BY_NAME.set(gov.name.toLowerCase(), gov);
  BY_CODE.set(gov.code.toLowerCase(), gov);
}

/**
 * Synchronous authoritative resolution of a governorate identifier.
 * Accepts integer ID, numeric string, canonical name, or ISO code.
 * Returns { id, name, code } or null.
 */
export function resolveGovernorateSync(identifier) {
  if (identifier === null || identifier === undefined) return null;

  if (typeof identifier === 'number') {
    if (Number.isInteger(identifier) && identifier > 0) {
      return BY_ID.get(identifier) || null;
    }
    return null;
  }

  if (typeof identifier === 'string') {
    const trimmed = identifier.trim();
    if (!trimmed) return null;

    if (/^\d+$/.test(trimmed)) {
      const parsedId = parseInt(trimmed, 10);
      return BY_ID.get(parsedId) || null;
    }

    const lower = trimmed.toLowerCase();
    if (BY_CODE.has(lower)) {
      return BY_CODE.get(lower);
    }
    if (BY_NAME.has(lower)) {
      return BY_NAME.get(lower);
    }
  }

  return null;
}
