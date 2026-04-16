/*
  Fix: "new row violates row-level security policy for table documents"

  The app uses the Supabase anon key without login. Original policies only allow
  authenticated users where auth.uid() = user_id, so inserts fail.

  Run in Supabase → SQL Editor (or: supabase db push).

  Drops all RLS policies on core tables, normalizes user_id, drops auth.users FKs,
  then creates permissive policies for roles anon + authenticated.
*/

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT policyname, tablename
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('documents', 'folders', 'tags', 'document_tags')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', r.policyname, r.tablename);
  END LOOP;
END $$;

UPDATE documents SET user_id = '00000000-0000-0000-0000-000000000001'::uuid WHERE user_id IS DISTINCT FROM '00000000-0000-0000-0000-000000000001'::uuid;
UPDATE tags SET user_id = '00000000-0000-0000-0000-000000000001'::uuid WHERE user_id IS DISTINCT FROM '00000000-0000-0000-0000-000000000001'::uuid;
UPDATE folders SET user_id = '00000000-0000-0000-0000-000000000001'::uuid WHERE user_id IS DISTINCT FROM '00000000-0000-0000-0000-000000000001'::uuid;

ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_user_id_fkey;
ALTER TABLE tags DROP CONSTRAINT IF EXISTS tags_user_id_fkey;
ALTER TABLE folders DROP CONSTRAINT IF EXISTS folders_user_id_fkey;

ALTER TABLE documents ALTER COLUMN user_id SET DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;
ALTER TABLE tags ALTER COLUMN user_id SET DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;
ALTER TABLE folders ALTER COLUMN user_id SET DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;

CREATE POLICY "Shared workspace select documents"
  ON documents FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Shared workspace insert documents"
  ON documents FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Shared workspace update documents"
  ON documents FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Shared workspace delete documents"
  ON documents FOR DELETE TO anon, authenticated USING (true);

CREATE POLICY "Shared workspace select tags"
  ON tags FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Shared workspace insert tags"
  ON tags FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Shared workspace update tags"
  ON tags FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Shared workspace delete tags"
  ON tags FOR DELETE TO anon, authenticated USING (true);

CREATE POLICY "Shared workspace select document_tags"
  ON document_tags FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Shared workspace insert document_tags"
  ON document_tags FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Shared workspace delete document_tags"
  ON document_tags FOR DELETE TO anon, authenticated USING (true);

CREATE POLICY "Shared workspace select folders"
  ON folders FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Shared workspace insert folders"
  ON folders FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Shared workspace update folders"
  ON folders FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Shared workspace delete folders"
  ON folders FOR DELETE TO anon, authenticated USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.documents TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.folders TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tags TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_tags TO anon, authenticated;
