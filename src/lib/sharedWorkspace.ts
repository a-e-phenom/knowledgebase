/**
 * Single shared workspace for no-login mode. All rows use this `user_id`.
 *
 * If inserts fail with "row-level security policy" on `documents`, run on Supabase (SQL Editor):
 * `supabase/migrations/20260415100000_ensure_anon_documents_rls.sql`
 * (or the full `20260414100000_public_shared_workspace.sql` bundle including storage).
 */
export const SHARED_WORKSPACE_USER_ID =
  (import.meta.env.VITE_SHARED_WORKSPACE_USER_ID as string | undefined) ??
  '00000000-0000-0000-0000-000000000001'
