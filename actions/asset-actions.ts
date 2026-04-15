'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { validateTelegramWebAppData } from '@/lib/telegram';
import { z } from 'zod';

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
  
  // 查询最新数据，确保 telegram_id 是字符串匹配
  const { data, error } = await supabase
    .from('users')
    .select('balance, stars')
    .eq('telegram_id', user.id.toString())
    .single();

  if (error) {
    console.error(`[Security] 获取用户 ${user.id} 资产失败:`, error);
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

/**
 * 执行资产变更 (消费或奖励)
 * 使用 RPC 确保 users 表更新与 resource_transactions 插入的原子性
 */
export async function processAssetChange(initData: string, params: any) {
  const { isValid, user } = validateTelegramWebAppData(initData);
  if (!isValid || !user) {
    return { success: false, error: '身份验证失败' };
  }

  const validated = assetChangeSchema.parse(params);
  const supabase = createAdminClient();

  // SECURITY: 调用服务端 RPC 函数，确保数据一致性
  const { data, error } = await supabase.rpc('update_user_assets_v2', {
    p_telegram_id: user.id.toString(),
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
    newBalance: data.new_balance
  };
}
