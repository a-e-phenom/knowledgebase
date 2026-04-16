/*
  Shared public workspace (no per-user login).

  1. Normalizes user_id on documents, tags, folders to one fixed UUID.
  2. Drops FKs to auth.users so that UUID does not need a real account.
  3. Replaces per-user RLS with policies allowing anon (and authenticated) full access.
  4. Storage: anon can insert/update/delete any object in bucket `documents` (read stays public).

  Run this in the Supabase SQL editor if you use a hosted project without applying migrations.
*/

-- Fixed workspace owner id (must match src/lib/sharedWorkspace.ts default unless you set VITE_SHARED_WORKSPACE_USER_ID)
UPDATE documents SET user_id = '00000000-0000-0000-0000-000000000001'::uuid WHERE user_id IS DISTINCT FROM '00000000-0000-0000-0000-000000000001'::uuid;
UPDATE tags SET user_id = '00000000-0000-0000-0000-000000000001'::uuid WHERE user_id IS DISTINCT FROM '00000000-0000-0000-0000-000000000001'::uuid;
UPDATE folders SET user_id = '00000000-0000-0000-0000-000000000001'::uuid WHERE user_id IS DISTINCT FROM '00000000-0000-0000-0000-000000000001'::uuid;

ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_user_id_fkey;
ALTER TABLE tags DROP CONSTRAINT IF EXISTS tags_user_id_fkey;
ALTER TABLE folders DROP CONSTRAINT IF EXISTS folders_user_id_fkey;

ALTER TABLE documents
  ALTER COLUMN user_id SET DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;
ALTER TABLE tags
  ALTER COLUMN user_id SET DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;
ALTER TABLE folders
  ALTER COLUMN user_id SET DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;

-- documents policies
DROP POLICY IF EXISTS "Users can view own documents" ON documents;
DROP POLICY IF EXISTS "Users can create own documents" ON documents;
DROP POLICY IF EXISTS "Users can update own documents" ON documents;
DROP POLICY IF EXISTS "Users can delete own documents" ON documents;

CREATE POLICY "Shared workspace select documents"
  ON documents FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Shared workspace insert documents"
  ON documents FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Shared workspace update documents"
  ON documents FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Shared workspace delete documents"
  ON documents FOR DELETE TO anon, authenticated USING (true);

-- tags policies
DROP POLICY IF EXISTS "Users can view own tags" ON tags;
DROP POLICY IF EXISTS "Users can create own tags" ON tags;
DROP POLICY IF EXISTS "Users can update own tags" ON tags;
DROP POLICY IF EXISTS "Users can delete own tags" ON tags;

CREATE POLICY "Shared workspace select tags"
  ON tags FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Shared workspace insert tags"
  ON tags FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Shared workspace update tags"
  ON tags FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Shared workspace delete tags"
  ON tags FOR DELETE TO anon, authenticated USING (true);

-- document_tags policies
DROP POLICY IF EXISTS "Users can view tags on own documents" ON document_tags;
DROP POLICY IF EXISTS "Users can add tags to own documents" ON document_tags;
DROP POLICY IF EXISTS "Users can remove tags from own documents" ON document_tags;

CREATE POLICY "Shared workspace select document_tags"
  ON document_tags FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Shared workspace insert document_tags"
  ON document_tags FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Shared workspace delete document_tags"
  ON document_tags FOR DELETE TO anon, authenticated USING (true);

-- folders policies
DROP POLICY IF EXISTS "Users can view own folders" ON folders;
DROP POLICY IF EXISTS "Users can create own folders" ON folders;
DROP POLICY IF EXISTS "Users can update own folders" ON folders;
DROP POLICY IF EXISTS "Users can delete own folders" ON folders;

CREATE POLICY "Shared workspace select folders"
  ON folders FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Shared workspace insert folders"
  ON folders FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Shared workspace update folders"
  ON folders FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Shared workspace delete folders"
  ON folders FOR DELETE TO anon, authenticated USING (true);

-- storage.objects — replace user-scoped policies with shared anon access
DROP POLICY IF EXISTS "Authenticated users can upload documents" ON storage.objects;
DROP POLICY IF EXISTS "Public read access for documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own documents" ON storage.objects;

INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read access for documents"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'documents');

CREATE POLICY "Anon upload documents"
  ON storage.objects FOR INSERT
  TO anon, authenticated
  WITH CHECK (bucket_id = 'documents');

CREATE POLICY "Anon update documents storage"
  ON storage.objects FOR UPDATE
  TO anon, authenticated
  USING (bucket_id = 'documents')
  WITH CHECK (bucket_id = 'documents');

CREATE POLICY "Anon delete documents storage"
  ON storage.objects FOR DELETE
  TO anon, authenticated
  USING (bucket_id = 'documents');
