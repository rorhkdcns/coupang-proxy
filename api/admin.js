const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://ivlyefexwmjslrlkghlm.supabase.co';

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const ADMIN_IDS = (process.env.ADMIN_USER_IDS || '').split(',').map(s => s.trim()).filter(Boolean);

  if (!SERVICE_KEY) {
    res.status(500).json({ error: 'Vercel 환경변수에 SUPABASE_SERVICE_ROLE_KEY가 설정되지 않았습니다.' });
    return;
  }
  if (!ADMIN_IDS.length) {
    res.status(500).json({ error: 'Vercel 환경변수에 ADMIN_USER_IDS가 설정되지 않았습니다.' });
    return;
  }

  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) {
    res.status(401).json({ error: '로그인 토큰이 없습니다.' });
    return;
  }

  const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_KEY);

  // 요청 보낸 사람이 진짜 관리자인지 토큰으로 확인
  const { data: callerData, error: callerErr } = await supabaseAdmin.auth.getUser(token);
  if (callerErr || !callerData || !callerData.user) {
    res.status(401).json({ error: '유효하지 않은 로그인입니다.' });
    return;
  }
  const callerId = callerData.user.id;
  if (!ADMIN_IDS.includes(callerId)) {
    res.status(403).json({ error: '관리자 권한이 없는 계정입니다.' });
    return;
  }

  const body = req.method === 'POST' ? (req.body || {}) : {};
  const action = (req.query.action || body.action || '').toString();

  try {
    if (action === 'list') {
      const { data: profiles, error } = await supabaseAdmin
        .from('dashboard_profiles')
        .select('id, username, created_at')
        .order('created_at', { ascending: true });
      if (error) throw error;
      res.status(200).json({ profiles });
      return;
    }

    if (action === 'get') {
      const userId = (req.query.userId || body.userId || '').toString();
      if (!userId) { res.status(400).json({ error: 'userId가 필요합니다.' }); return; }
      const { data, error } = await supabaseAdmin
        .from('workspace_state').select('data').eq('id', userId).maybeSingle();
      if (error) throw error;
      res.status(200).json({ data: data ? data.data : null });
      return;
    }

    if (action === 'save') {
      const userId = (body.userId || '').toString();
      const stateData = body.data;
      if (!userId || !stateData) { res.status(400).json({ error: 'userId와 data가 필요합니다.' }); return; }
      const { error } = await supabaseAdmin
        .from('workspace_state')
        .upsert({ id: userId, data: stateData, updated_at: new Date().toISOString() });
      if (error) throw error;
      res.status(200).json({ ok: true });
      return;
    }

    if (action === 'delete') {
      const userId = (req.query.userId || body.userId || '').toString();
      if (!userId) { res.status(400).json({ error: 'userId가 필요합니다.' }); return; }
      if (ADMIN_IDS.includes(userId)) {
        res.status(400).json({ error: '관리자 계정은 이 화면에서 삭제할 수 없습니다.' });
        return;
      }
      await supabaseAdmin.from('workspace_state').delete().eq('id', userId);
      await supabaseAdmin.from('dashboard_profiles').delete().eq('id', userId);
      const { error: delErr } = await supabaseAdmin.auth.admin.deleteUser(userId);
      if (delErr) throw delErr;
      res.status(200).json({ ok: true });
      return;
    }

    res.status(400).json({ error: '알 수 없는 action입니다: ' + action });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
