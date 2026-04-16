/**
 * Supabase Storage bucket for uploaded document files.
 * Create it in Dashboard → Storage → New bucket (name must match, public read recommended),
 * or run: supabase/migrations/20260401120000_create_storage_bucket.sql
 * Optional override: VITE_SUPABASE_STORAGE_BUCKET
 */
export const DOCUMENTS_STORAGE_BUCKET =
  (import.meta.env.VITE_SUPABASE_STORAGE_BUCKET as string | undefined)?.trim() || 'documents'
