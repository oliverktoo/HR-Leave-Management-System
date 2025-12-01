import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Please check your .env file.');
}

// Using untyped client to avoid Database generic type conflicts
// Type safety is enforced at the service layer instead
export const supabase: SupabaseClient = createClient(
  supabaseUrl,
  supabaseAnonKey
);
