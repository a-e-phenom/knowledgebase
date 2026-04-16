/*
  Run this in the Supabase SQL editor if uploads fail with RLS / policy errors.

  1. Ensures the `documents` bucket exists (public read).
  2. Recreates storage.objects policies so paths look like: {auth.uid()}/filename.ext
     (matches the app: `${user.id}/${Date.now()}.ext`).

  Uses split_part(name, '/', 1) = auth.uid()::text — reliable for user-folder uploads.
*/

INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Authenticated users can upload documents" ON storage.objects;
DROP POLICY IF EXISTS "Public read access for documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own documents" ON storage.objects;

CREATE POLICY "Authenticated users can upload documents"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'documents'
    AND split_part(name, '/', 1) = auth.uid()::text
  );

CREATE POLICY "Public read access for documents"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'documents');

CREATE POLICY "Users can delete own documents"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'documents'
    AND split_part(name, '/', 1) = auth.uid()::text
  );

-- Overwrites / upsert to same path need UPDATE on storage.objects
CREATE POLICY "Users can update own documents"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'documents'
    AND split_part(name, '/', 1) = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'documents'
    AND split_part(name, '/', 1) = auth.uid()::text
  );
