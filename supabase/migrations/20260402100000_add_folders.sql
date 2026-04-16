/*
  # Add Folders

  1. New Table
    - `folders`
      - `id` (uuid, primary key)
      - `name` (text, required)
      - `parent_id` (uuid, nullable, self-reference) - for nested folders
      - `created_at` (timestamptz)
      - `user_id` (uuid, foreign key)

  2. Changes
    - Add `folder_id` nullable column to `documents` referencing `folders(id)`

  3. Security
    - Enable RLS on `folders`
    - Users can only CRUD their own folders
*/

-- Create folders table
CREATE TABLE IF NOT EXISTS folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  parent_id uuid REFERENCES folders(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL
);

-- Add folder_id to documents
ALTER TABLE documents ADD COLUMN IF NOT EXISTS folder_id uuid REFERENCES folders(id) ON DELETE SET NULL;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_folders_user_id ON folders(user_id);
CREATE INDEX IF NOT EXISTS idx_folders_parent_id ON folders(parent_id);
CREATE INDEX IF NOT EXISTS idx_documents_folder_id ON documents(folder_id);

-- Enable RLS
ALTER TABLE folders ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view own folders"
  ON folders FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own folders"
  ON folders FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own folders"
  ON folders FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own folders"
  ON folders FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
