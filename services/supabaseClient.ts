import { createClient } from '@supabase/supabase-js';

// Supabase configuration - Uses environment variables with fallback
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://cmzeijcyykzdmvisojte.supabase.co';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtemVpamN5eWt6ZG12aXNvanRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNzc5MTYsImV4cCI6MjA5MzY1MzkxNn0.qn5_sVmmZ1gb6YQCaO2RQYWRO-XwVTuLTY64LK8mAME';

// Create and export Supabase client
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Export configuration for debugging
export const supabaseConfig = {
    url: SUPABASE_URL,
    isConfigured: !!import.meta.env.VITE_SUPABASE_URL,
};

// ── Availability tracking ──────────────────────────────────────────────────
// When Supabase returns a 402/quota error, all writes are skipped for
// RETRY_INTERVAL_MS to avoid console spam and unnecessary failed requests.
const RETRY_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
let _unavailableSince: number | null = null;

export function markSupabaseUnavailable(): void {
    if (_unavailableSince === null) {
        console.warn('[Supabase] Proyecto restringido — escrituras deshabilitadas hasta que se resuelva la cuota.');
    }
    _unavailableSince = Date.now();
}

export function isSupabaseAvailable(): boolean {
    if (_unavailableSince === null) return true;
    if (Date.now() - _unavailableSince > RETRY_INTERVAL_MS) {
        _unavailableSince = null; // reset y reintentar
        return true;
    }
    return false;
}

export function isQuotaError(msg: string): boolean {
    const lower = (msg || '').toLowerCase();
    return lower.includes('restricted') || lower.includes('exceed') ||
           lower.includes('quota') || lower.includes('payment required');
}
