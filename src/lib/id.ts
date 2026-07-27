export function id(prefix: string): string {
  return `${prefix}_${newId()}`;
}

/** A real UUID (matches every table's `id uuid` column) — generated client-side so create* actions can still return the created object synchronously, with the same id the DB row ends up with. */
export function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function tagToken(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 8; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return `SHZ-${out}`;
}
