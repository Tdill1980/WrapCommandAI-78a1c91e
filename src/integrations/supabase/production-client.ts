// Production Supabase client - always uses WePrintWraps Supabase (qxllysilzonrlyoaomce)
// Use this for ALL database operations. NEVER use Lovable's Supabase for data.
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

// WePrintWraps Production Supabase
const SUPABASE_URL = 'https://qxllysilzonrlyoaomce.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4bGx5c2lsem9ucmx5b2FvbWNlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgyMzQxMjIsImV4cCI6MjA4MzgxMDEyMn0.s1IyOY7QAVyrTtG_XLhugJUvxi2X_nHCvqvchYCvwtM';

// Edge functions URL for WePrintWraps Supabase
export const WPW_FUNCTIONS_URL = 'https://qxllysilzonrlyoaomce.supabase.co/functions/v1';

// Production client for database operations
export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  }
});

// Helper to call edge functions on WePrintWraps Supabase
export async function callEdgeFunction<T = any>(
  functionName: string,
  body: Record<string, any> = {},
  method: 'GET' | 'POST' = 'POST'
): Promise<T> {
  const url = `${WPW_FUNCTIONS_URL}/${functionName}`;
  const response = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: method === 'POST' ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Edge function ${functionName} failed: ${response.status} - ${text}`);
  }

  return response.json();
}
