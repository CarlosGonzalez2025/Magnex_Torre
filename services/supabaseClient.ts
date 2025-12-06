import { createClient } from '@supabase/supabase-js';

// Supabase configuration
const SUPABASE_URL = 'https://ppqlbgpxwcbirarxtgam.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBwcWxiZ3B4d2NiaXJhcnh0Z2FtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ3Nzc2NzMsImV4cCI6MjA4MDM1MzY3M30.Ha6RvnPbFznVTR34LAsIuk8SHO2NIS5KiSdcf_Hgq9Y';

// Create and export Supabase client
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
