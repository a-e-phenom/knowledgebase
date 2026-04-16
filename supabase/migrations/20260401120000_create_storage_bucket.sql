/*
  # Create Storage Bucket for Document Uploads

  1. Creates a public `documents` storage bucket
  2. Adds RLS policies so authenticated users can:
     - Upload files under their own user_id folder
     - Read any file in the bucket (public)
     - Delete their own files
*/

-- Create the documents storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', true)
ON CONFLICT (id) DO NOTHING;

-- Path must be {user uuid}/... (see app upload). split_part is reliable vs foldername().
CREATE POLICY "Authenticated users can upload documents"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'documents'
    AND split_part(name, '/', 1) = auth.uid()::text
  );

-- Allow public read access to all files in the bucket
CREATE POLICY "Public read access for documents"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'documents');

-- Allow users to delete their own files
CREATE POLICY "Users can delete own documents"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'documents'
    AND split_part(name, '/', 1) = auth.uid()::text
  );

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
