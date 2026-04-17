'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { validateTelegramWebAppData } from '@/lib/telegram';
import { z } from 'zod';
import type { Database } from '@/types/supabase';

// 校验资产变更参数
const assetChangeSchema = z.object({
  amount: z.number(),
  type: z.enum(['balance', 'stars']),
  reason: z.string()
});

/**
 * 同步用户资产 (登录时调用)
 * SECURITY: 验证 Telegram initData 确保身份真实性
 */
export async function syncUserAssets(initData: string) {
  const { isValid, user } = validateTelegramWebAppData(initData);
  if (!isValid || !user) {
    return { success: false, error: '身份验证失败' };
  }

  const supabase = createAdminClient();

  // 新用户首次进入可能还没有 users 行；这里做幂等初始化，避免 PGRST116（0 行）导致“同步失败”
  // SECURITY: 仅使用服务端验签后的 tg user.id 作为唯一身份，不信任客户端传 userId
  const now = new Date().toISOString();
  const bootstrapUser: Database['public']['Tables']['users']['Insert'] = {
    telegram_id: user.id,
    first_name: user.first_name || 'Guest',
    last_name: user.last_name ?? null,
    username: user.username ?? null,
    avatar_url: user.photo_url ?? null,
    balance: 1000,
    stars: 0,
    created_at: now,
    updated_at: now,
  };

  // 尝试创建（若已存在则忽略），确保后续查询一定有行
  const { error: bootstrapErr } = await supabase
    .from('users')
    .upsert(bootstrapUser, { onConflict: 'telegram_id', ignoreDuplicates: true });

  if (bootstrapErr) {
    console.error(`[Security] 初始化用户 ${user.id} 资产失败:`, bootstrapErr);
    return { success: false, error: '数据库同步失败' };
  }

  // 处理邀请（share 链接新用户进入时会带 start_param），不阻塞主同步流程
  // SECURITY: start_param 不可信；inviter/invitee 身份以服务端验签后的 tg user.id 为准
  try {
    const params = new URLSearchParams(initData);
    const startParam = params.get('start_param');
    const match = startParam?.match(/^ref_(\d+)$/);
    const inviterTelegramId = match ? Number(match[1]) : null;
    if (inviterTelegramId && Number.isFinite(inviterTelegramId)) {
      const rewardAmount = Number(process.env.INVITE_REWARD_AMOUNT || 100);
      await supabase.rpc('accept_invite_and_reward', {
        p_inviter_telegram_id: inviterTelegramId,
        p_invitee_telegram_id: user.id,
        p_invite_code: startParam ?? `ref_${inviterTelegramId}`,
        p_reward_type: 'coins',
        p_amount: Number.isFinite(rewardAmount) && rewardAmount > 0 ? rewardAmount : 100,
      });
    }
  } catch (e) {
    console.warn('Invite processing skipped:', e);
  }

  // 查询最新数据（telegram_id 对应 TS number）
  const { data, error } = await supabase
    .from('users')
    .select('balance, stars')
    .eq('telegram_id', user.id)
    .maybeSingle();

  if (error || !data) {
    console.error(`[Security] 获取用户 ${user.id} 资产失败:`, error ?? 'no row');
    return { success: false, error: '数据库同步失败' };
  }

  return { 
    success: true, 
    data: {
      balance: Number(data.balance || 0),
      stars: Number(data.stars || 0)
    }
  };
}

type AssetChangeParams = z.infer<typeof assetChangeSchema>;

/**
 * 执行资产变更 (消费或奖励)
 * 使用 RPC 确保 users 表更新与 resource_transactions 插入的原子性
 */
export async function processAssetChange(initData: string, params: AssetChangeParams) {
  const { isValid, user } = validateTelegramWebAppData(initData);
  if (!isValid || !user) {
    return { success: false, error: '身份验证失败' };
  }

  const validated = assetChangeSchema.parse(params);
  const supabase = createAdminClient();

  // SECURITY: 调用服务端 RPC 函数，确保数据一致性
  const { data, error } = await supabase.rpc('execute_asset_transaction', {
    p_telegram_id: user.id,
    p_resource_type: validated.type,
    p_amount: validated.amount,
    p_reason: validated.reason
  });

  if (error) {
    console.error('资产更新失败:', error);
    return { success: false, error: error.message };
  }

  return {
    success: true,
    newBalance: (data as unknown as { new_balance?: number | string } | null)?.new_balance
  };
}
