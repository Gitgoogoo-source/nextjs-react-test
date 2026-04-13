'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { validateTelegramWebAppData } from '@/lib/telegram';

export async function syncTelegramUser(initData: string) {
  try {
    // #region agent log
    void fetch('http://127.0.0.1:7350/ingest/1b4a6dd6-a323-4199-9b3b-37ab802be016', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Debug-Session-Id': '3430d0',
      },
      body: JSON.stringify({
        sessionId: '3430d0',
        runId: 'telegram-auth-pre-fix',
        hypothesisId: 'H2',
        location: 'app/actions/auth.ts:7',
        message: '服务端收到 syncTelegramUser 请求',
        data: {
          initDataLength: initData.length,
          hasHash: initData.includes('hash='),
          hasUser: initData.includes('user='),
          hasAuthDate: initData.includes('auth_date='),
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion

    const { isValid, user, reason } = validateTelegramWebAppData(initData);

    if (!isValid || !user) {
      // #region agent log
      void fetch('http://127.0.0.1:7350/ingest/1b4a6dd6-a323-4199-9b3b-37ab802be016', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Debug-Session-Id': '3430d0',
        },
        body: JSON.stringify({
          sessionId: '3430d0',
          runId: 'telegram-auth-pre-fix',
          hypothesisId: 'H3',
          location: 'app/actions/auth.ts:29',
          message: '服务端判定 Telegram 数据无效',
          data: {
            isValid,
            hasUser: Boolean(user),
            reason: reason ?? null,
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion

      if (reason === 'missing_bot_token') {
        return { success: false, error: 'Server configuration error: TELEGRAM_BOT_TOKEN missing' };
      }

      return { success: false, error: 'Invalid Telegram data' };
    }

    // #region agent log
    void fetch('http://127.0.0.1:7350/ingest/1b4a6dd6-a323-4199-9b3b-37ab802be016', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Debug-Session-Id': '3430d0',
      },
      body: JSON.stringify({
        sessionId: '3430d0',
        runId: 'telegram-auth-pre-fix',
        hypothesisId: 'H4',
        location: 'app/actions/auth.ts:46',
        message: '服务端验签通过并拿到用户',
        data: {
          telegramId: user.id,
          hasUsername: Boolean(user.username),
          hasPhoto: Boolean(user.photo_url),
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion

    let supabase;
    try {
      supabase = createAdminClient();
    } catch (error) {
      // #region agent log
      void fetch('http://127.0.0.1:7350/ingest/1b4a6dd6-a323-4199-9b3b-37ab802be016', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Debug-Session-Id': '3430d0',
        },
        body: JSON.stringify({
          sessionId: '3430d0',
          runId: 'telegram-auth-db-phase',
          hypothesisId: 'H8',
          location: 'app/actions/auth.ts:88',
          message: '创建 Supabase admin 客户端失败',
          data: {
            hasAdminClient: false,
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion

      console.error('Error creating admin client:', error);
      return { success: false, error: 'Server configuration error: SUPABASE_SERVICE_ROLE_KEY missing' };
    }

    // Check if user exists
    const { data: existingUser, error: fetchError } = await supabase
      .from('users')
      .select('*')
      .eq('telegram_id', user.id)
      .single();

    // #region agent log
    void fetch('http://127.0.0.1:7350/ingest/1b4a6dd6-a323-4199-9b3b-37ab802be016', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Debug-Session-Id': '3430d0',
      },
      body: JSON.stringify({
        sessionId: '3430d0',
        runId: 'telegram-auth-db-phase',
        hypothesisId: 'H5',
        location: 'app/actions/auth.ts:40',
        message: 'users 查询结果',
        data: {
          hasExistingUser: Boolean(existingUser),
          fetchErrorCode: fetchError?.code ?? null,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion

    if (fetchError && fetchError.code !== 'PGRST116') { // PGRST116 means no rows returned
      console.error('Error fetching user:', fetchError);
      return { success: false, error: 'Database error' };
    }

    const now = new Date().toISOString();

    if (existingUser) {
      // Update last login
      const { error: updateError } = await supabase
        .from('users')
        .update({
          username: user.username || existingUser.username,
          first_name: user.first_name || existingUser.first_name,
          last_name: user.last_name || existingUser.last_name,
          avatar_url: user.photo_url || existingUser.avatar_url,
          updated_at: now,
          balance: typeof existingUser.balance === 'number' ? existingUser.balance : 1000,
        })
        .eq('telegram_id', user.id);

      // #region agent log
      void fetch('http://127.0.0.1:7350/ingest/1b4a6dd6-a323-4199-9b3b-37ab802be016', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Debug-Session-Id': '3430d0',
        },
        body: JSON.stringify({
          sessionId: '3430d0',
          runId: 'telegram-auth-db-phase',
          hypothesisId: 'H6',
          location: 'app/actions/auth.ts:72',
          message: 'users 更新结果',
          data: {
            updateErrorCode: updateError?.code ?? null,
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion

      if (updateError) {
        console.error('Error updating user:', updateError);
        return { success: false, error: 'Failed to update user' };
      }
    } else {
      // Create new user with 1000 balance
      const { error: insertError } = await supabase
        .from('users')
        .insert({
          telegram_id: user.id,
          username: user.username,
          first_name: user.first_name,
          last_name: user.last_name,
          avatar_url: user.photo_url,
          balance: 1000,
          created_at: now,
          updated_at: now,
        });

      // #region agent log
      void fetch('http://127.0.0.1:7350/ingest/1b4a6dd6-a323-4199-9b3b-37ab802be016', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Debug-Session-Id': '3430d0',
        },
        body: JSON.stringify({
          sessionId: '3430d0',
          runId: 'telegram-auth-db-phase',
          hypothesisId: 'H7',
          location: 'app/actions/auth.ts:103',
          message: 'users 插入结果',
          data: {
            insertErrorCode: insertError?.code ?? null,
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion

      if (insertError) {
        console.error('Error creating user:', insertError);
        return { success: false, error: 'Failed to create user' };
      }
    }

    return { success: true, user };
  } catch (error) {
    console.error('Sync error:', error);
    return { success: false, error: 'Internal server error' };
  }
}
