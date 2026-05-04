import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export type Database = {
  public: {
    Tables: {
      documents: {
        Row: {
          id: string
          title: string
          content: string | null
          file_url: string | null
          file_type: string | null
          file_name: string | null
          folder_id: string | null
          created_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          id?: string
          title: string
          content?: string | null
          file_url?: string | null
          file_type?: string | null
          file_name?: string | null
          folder_id?: string | null
          created_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          id?: string
          title?: string
          content?: string | null
          file_url?: string | null
          file_type?: string | null
          file_name?: string | null
          folder_id?: string | null
          created_at?: string
          updated_at?: string
          user_id?: string
        }
      }
      folders: {
        Row: {
          id: string
          name: string
          parent_id: string | null
          created_at: string
          user_id: string
        }
        Insert: {
          id?: string
          name: string
          parent_id?: string | null
          created_at?: string
          user_id: string
        }
        Update: {
          id?: string
          name?: string
          parent_id?: string | null
          created_at?: string
          user_id?: string
        }
      }
      tags: {
        Row: {
          id: string
          name: string
          color: string
          created_at: string
          user_id: string
        }
        Insert: {
          id?: string
          name: string
          color?: string
          created_at?: string
          user_id: string
        }
        Update: {
          id?: string
          name?: string
          color?: string
          created_at?: string
          user_id?: string
        }
      }
      document_tags: {
        Row: {
          document_id: string
          tag_id: string
          created_at: string
        }
        Insert: {
          document_id: string
          tag_id: string
          created_at?: string
        }
        Update: {
          document_id?: string
          tag_id?: string
          created_at?: string
        }
      }
      workspace_modules: {
        Row: {
          id: string
          data: Record<string, unknown>
          updated_at: string
        }
        Insert: {
          id: string
          data: Record<string, unknown>
          updated_at?: string
        }
        Update: {
          id?: string
          data?: Record<string, unknown>
          updated_at?: string
        }
      }
      workspace_apps: {
        Row: {
          id: string
          title: string
          description: string
          link: string
          created_at: string
        }
        Insert: {
          id?: string
          title: string
          description?: string
          link: string
          created_at?: string
        }
        Update: {
          id?: string
          title?: string
          description?: string
          link?: string
          created_at?: string
        }
      }
      workspace_app_data: {
        Row: {
          id: string
          data: Record<string, unknown>
          updated_at: string
        }
        Insert: {
          id: string
          data: Record<string, unknown>
          updated_at?: string
        }
        Update: {
          id?: string
          data?: Record<string, unknown>
          updated_at?: string
        }
      }
    }
  }
}
