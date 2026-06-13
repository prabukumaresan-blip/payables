import { createBrowserClient } from '@supabase/ssr';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = () => {
  return (
    supabaseUrl &&
    supabaseAnonKey &&
    !supabaseUrl.includes('your-project') &&
    !supabaseAnonKey.includes('placeholder-key')
  );
};

export const createClient = () => {
  if (!isSupabaseConfigured()) {
    return null as any; // Safe fallback since queries check isSupabaseConfigured()
  }
  return createBrowserClient(supabaseUrl, supabaseAnonKey);
};
