/** Any 8-4-4-4-12 hex form — avoids Supabase dropping invalid `.eq('id', …)` and returning many rows. */
export function isLikelyDatabaseUuid(value: string | undefined | null): boolean {
  if (!value || typeof value !== 'string') return false
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim())
}

export function firstOrNull<T>(rows: T[] | null | undefined): T | null {
  const r = rows?.[0]
  return r === undefined ? null : r
}
