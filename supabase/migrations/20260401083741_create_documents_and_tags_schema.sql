/*
  # Create Documents and Tags Schema

  1. New Tables
    - `documents`
      - `id` (uuid, primary key)
      - `title` (text, required) - Document title
      - `content` (text) - Markdown content for Notion-like documents
      - `file_url` (text) - URL for uploaded files
      - `file_type` (text) - MIME type of uploaded file
      - `file_name` (text) - Original filename
      - `created_at` (timestamptz) - Creation timestamp
      - `updated_at` (timestamptz) - Last update timestamp
      - `user_id` (uuid, foreign key) - Owner of the document
    
    - `tags`
      - `id` (uuid, primary key)
      - `name` (text, required, unique per user) - Tag name
      - `color` (text) - Color hex code for visual distinction
      - `created_at` (timestamptz) - Creation timestamp
      - `user_id` (uuid, foreign key) - Owner of the tag
    
    - `document_tags`
      - `document_id` (uuid, foreign key)
      - `tag_id` (uuid, foreign key)
      - `created_at` (timestamptz)
      - Composite primary key on (document_id, tag_id)

  2. Security
    - Enable RLS on all tables
    - Users can only read/write their own documents
    - Users can only read/write their own tags
    - Users can only manage tags for their own documents
*/

-- Create documents table
CREATE TABLE IF NOT EXISTS documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  content text DEFAULT '',
  file_url text,
  file_type text,
  file_name text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL
);

-- Create tags table
CREATE TABLE IF NOT EXISTS tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  color text DEFAULT '#6366f1',
  created_at timestamptz DEFAULT now(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  UNIQUE(user_id, name)
);

-- Create document_tags junction table
CREATE TABLE IF NOT EXISTS document_tags (
  document_id uuid REFERENCES documents(id) ON DELETE CASCADE NOT NULL,
  tag_id uuid REFERENCES tags(id) ON DELETE CASCADE NOT NULL,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (document_id, tag_id)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents(user_id);
CREATE INDEX IF NOT EXISTS idx_documents_created_at ON documents(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tags_user_id ON tags(user_id);
CREATE INDEX IF NOT EXISTS idx_document_tags_document_id ON document_tags(document_id);
CREATE INDEX IF NOT EXISTS idx_document_tags_tag_id ON document_tags(tag_id);

-- Enable Row Level Security
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_tags ENABLE ROW LEVEL SECURITY;

-- Documents policies
CREATE POLICY "Users can view own documents"
  ON documents FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own documents"
  ON documents FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own documents"
  ON documents FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own documents"
  ON documents FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Tags policies
CREATE POLICY "Users can view own tags"
  ON tags FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own tags"
  ON tags FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own tags"
  ON tags FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own tags"
  ON tags FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Document_tags policies
CREATE POLICY "Users can view tags on own documents"
  ON document_tags FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM documents
      WHERE documents.id = document_tags.document_id
      AND documents.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can add tags to own documents"
  ON document_tags FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM documents
      WHERE documents.id = document_tags.document_id
      AND documents.user_id = auth.uid()
    )
    AND
    EXISTS (
      SELECT 1 FROM tags
      WHERE tags.id = document_tags.tag_id
      AND tags.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can remove tags from own documents"
  ON document_tags FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM documents
      WHERE documents.id = document_tags.document_id
      AND documents.user_id = auth.uid()
    )
  );

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
CREATE TRIGGER update_documents_updated_at
  BEFORE UPDATE ON documents
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();