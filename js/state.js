// Trạng thái đăng nhập dùng chung.
import { supabase } from './supabase-client.js';

export const state = {
  session: null,   // phiên Supabase Auth
  me: null,        // hồ sơ nhân viên của người đang đăng nhập (null nếu chưa gắn)
  isHr: false,
  isApprover: false,
};

/** Tải lại phiên và hồ sơ nhân viên. */
export async function refreshSession() {
  const { data } = await supabase.auth.getSession();
  state.session = data.session;
  state.me = null;
  state.isHr = false;
  state.isApprover = false;
  if (!state.session) return;

  // Hồ sơ của chính mình (RLS chỉ trả về khi tài khoản đã gắn và nhân viên đang làm việc)
  const { data: me, error } = await supabase
    .from('employees')
    .select('*')
    .eq('user_id', state.session.user.id)
    .maybeSingle();
  if (error) throw error;
  state.me = me;
  if (!me) return;

  state.isHr = me.role === 'hr';
  const { count } = await supabase
    .from('employees')
    .select('id', { count: 'exact', head: true })
    .eq('approver_id', me.id)
    .eq('is_active', true);
  state.isApprover = (count || 0) > 0;
}
