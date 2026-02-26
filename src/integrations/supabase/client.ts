// =============================================================================
// ⚠️ SUPABASE CLIENT CONFIGURATION - READ BEFORE MODIFYING ⚠️
// =============================================================================
//
// ARCHITECTURE (CONSOLIDATED — Feb 17 2026):
// ALL data now lives in YOUR Supabase (qxllysilzonrlyoaomce).
// - supabase: Database client → YOUR Supabase
// - lovableFunctions: Edge functions → YOUR Supabase
// - lovable3DRenders: NOW POINTS TO YOUR Supabase (was Lovable, migrated)
// - contentDB: Alias for lovable3DRenders → YOUR Supabase
//
// Lovable Supabase (wzwqhfbmymrengjqikjl) is DEPRECATED for data.
// Lovable connection kept ONLY for legacy 3D render edge function calls.
//
// =============================================================================

import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

// =============================================================================
// YOUR SUPABASE - WePrintWraps Production (qxllysilzonrlyoaomce)
// =============================================================================
const WPW_SUPABASE_URL = 'https://qxllysilzonrlyoaomce.supabase.co';
const WPW_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4bGx5c2lsem9ucmx5b2FvbWNlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgyMzQxMjIsImV4cCI6MjA4MzgxMDEyMn0.s1IyOY7QAVyrTtG_XLhugJUvxi2X_nHCvqvchYCvwtM';

// Edge functions URL for YOUR Supabase
export const WPW_FUNCTIONS_URL = `${WPW_SUPABASE_URL}/functions/v1`;

// =============================================================================
// LOVABLE SUPABASE - ONLY FOR 3D RENDERS (wzwqhfbmymrengjqikjl)
// =============================================================================
// ⚠️ LOVABLE CONNECTION - FOR 3D RENDERS ONLY - DO NOT USE FOR DATA
const LOVABLE_SUPABASE_URL = 'https://wzwqhfbmymrengjqikjl.supabase.co';
const LOVABLE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind6d3FoZmJteW1yZW5nanFpa2psIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMyNDM3OTgsImV4cCI6MjA3ODgxOTc5OH0.-LtBxqJ7gNmImakDRGQyr1e7FXrJCQQXF5zE5Fre_1I';
export const LOVABLE_FUNCTIONS_API_URL = `${LOVABLE_SUPABASE_URL}/functions/v1`;
export const LOVABLE_AUTH_KEY = LOVABLE_ANON_KEY;

// =============================================================================
// MAIN CLIENTS
// =============================================================================

// Database client - YOUR Supabase
export const supabase = createClient<Database>(WPW_SUPABASE_URL, WPW_ANON_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  }
});

// Edge functions client - YOUR Supabase (used by 90% of the app)
// This was incorrectly pointing to Lovable before - NOW FIXED
export const lovableFunctions = createClient(WPW_SUPABASE_URL, WPW_ANON_KEY);

// =============================================================================
// CONTENT + RENDER CLIENT — NOW YOUR SUPABASE (consolidated Feb 17 2026)
// =============================================================================
// All content tables (content_files, content_queue, content_calendar,
// content_drafts, content_projects) now live in YOUR Supabase.
// lovable3DRenders name kept for backward compat with 41+ importing files.
export const lovable3DRenders = createClient(WPW_SUPABASE_URL, WPW_ANON_KEY);

// contentDB: Alias for clarity — content_files, content_queue, etc.
export const contentDB = lovable3DRenders;

// =============================================================================
// LOVABLE LEGACY — 3D RENDER EDGE FUNCTIONS ONLY
// =============================================================================
// Only used for calling edge functions on Lovable that haven't been migrated yet.
// e.g. generate-3d, generate-3dproof if still deployed on Lovable.
export const lovableLegacy = createClient(LOVABLE_SUPABASE_URL, LOVABLE_ANON_KEY);

// =============================================================================
// HELPER FUNCTION - Call edge functions on YOUR Supabase
// =============================================================================
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
      'apikey': WPW_ANON_KEY,
      'Authorization': `Bearer ${WPW_ANON_KEY}`,
    },
    body: method === 'POST' ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Edge function ${functionName} failed: ${response.status} - ${text}`);
  }

  return response.json();
}
