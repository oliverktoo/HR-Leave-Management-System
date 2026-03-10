import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Try to get from environment, fallback to hardcoded values
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string || 'https://nmvdagfduojwbsxgqkjw.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5tdmRhZ2ZkdW9qd2JzeGdxa2p3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMxNzUxNzMsImV4cCI6MjA3ODc1MTE3M30.kfHFaNYGzSEVl7TgTdIj43Iw67hUZu7LwESX77vxJWA';

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Please check your .env file.');
}

console.log('🔗 Connecting to Supabase:', supabaseUrl);

// Using untyped client to avoid Database generic type conflicts
// Type safety is enforced at the service layer instead
export const supabase: SupabaseClient = createClient(
  supabaseUrl,
  supabaseAnonKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
    global: {
      headers: {
        'X-Client-Info': 'fkf-hr-mobile',
      },
    },
  }
);
