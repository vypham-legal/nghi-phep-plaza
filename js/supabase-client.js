import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.4/+esm';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';

// Chặn nhầm lẫn nguy hiểm: không bao giờ chạy với secret / service_role key.
function looksSecret(key) {
  if (key.startsWith('sb_secret_')) return true;
  const parts = key.split('.');
  if (parts.length === 3) {
    try {
      const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
      return payload.role === 'service_role';
    } catch { /* không phải JWT */ }
  }
  return false;
}

export const configProblem =
  SUPABASE_URL.includes('YOUR-PROJECT-REF') || SUPABASE_PUBLISHABLE_KEY.includes('YOUR_KEY')
    ? 'Chưa điền SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY trong js/config.js.'
    : looksSecret(SUPABASE_PUBLISHABLE_KEY)
      ? 'NGUY HIỂM: js/config.js đang chứa secret/service_role key. Xóa ngay và thay bằng Publishable key.'
      : null;

export const supabase = configProblem
  ? null
  : createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
