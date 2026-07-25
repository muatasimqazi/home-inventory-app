// Category accent trio (PRD §3): item-type color coding only, never chrome/actions.
const ACCENTS = ["bg-accent-yellow", "bg-accent-orange", "bg-accent-pink"] as const;

export function categoryAccentClass(category: string): string {
  let hash = 0;
  for (let i = 0; i < category.length; i++) hash = (hash * 31 + category.charCodeAt(i)) >>> 0;
  return ACCENTS[hash % ACCENTS.length];
}

export interface CategoryExtraField {
  key: string;
  label: string;
  placeholder?: string;
}

// Optional, category-scoped extra fields — not a generic custom-field system.
// Keep short; Item Detail should stay skimmable, not feel like a database form.
export const CATEGORY_EXTRA_FIELDS: Record<string, CategoryExtraField[]> = {
  Tool: [
    { key: "modelNumber", label: "Model number" },
    { key: "batteryType", label: "Battery type" },
    { key: "serialNumber", label: "Serial number" },
  ],
  Electronics: [
    { key: "serialNumber", label: "Serial number" },
    { key: "warrantyEnd", label: "Warranty end", placeholder: "YYYY-MM-DD" },
  ],
  Document: [
    { key: "expirationDate", label: "Expiration date", placeholder: "YYYY-MM-DD" },
    { key: "issuer", label: "Issuer" },
  ],
  Clothing: [{ key: "size", label: "Size" }],
};

export function extraFieldsForCategory(category: string): CategoryExtraField[] {
  return CATEGORY_EXTRA_FIELDS[category] ?? [];
}
