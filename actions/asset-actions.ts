"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { validateTelegramWebAppData } from "@/lib/telegram";

/**
 * SECURITY: 同步用户资产 (Coins/Balance & Stars)
 * 1. 验证 Telegram initData
 * 2. 如果用户不存在，则创建新用户 (默认赠送 1000 balance)
 * 3. 返回最新的资产信息
 */
export async function syncUserAssets(initData: string) {
  const { isValid, user } = validateTelegramWebAppData(initData);

  if (!isValid || !user) {
    throw new Error("Invalid Telegram identity");
  }

  const supabase = createAdminClient();

  // 尝试获取用户，如果不存在则创建
  const { data, error } = await supabase
    .from("users")
    .upsert(
      {
        telegram_id: user.id,
        username: user.username,
        first_name: user.first_name,
        last_name: user.last_name,
        avatar_url: user.photo_url,
        last_login_at: new Date().toISOString(),
      },
      { onConflict: "telegram_id" }
    )
    .select("id, balance, stars")
    .single();

  if (error) {
    console.error("Error syncing user assets:", error);
    throw new Error("Failed to sync assets");
  }

  return { success: true, data };
}

/**
 * SECURITY: 执行资产变动 (事务性)
 * 1. 验证 Telegram initData
 * 2. 调用数据库 RPC 执行原子性操作 (更新余额 + 插入流水)
 */
export async function processAssetChange(
  initData: string,
  params: { amount: number; type: "balance" | "stars"; reason: string }
) {
  const { isValid, user } = validateTelegramWebAppData(initData);

  if (!isValid || !user) {
    throw new Error("Invalid Telegram identity");
  }

  const supabase = createAdminClient();

  // 调用我们在 SQL 阶段创建的 execute_asset_transaction RPC
  const { data, error } = await supabase.rpc("execute_asset_transaction", {
    p_telegram_id: user.id,
    p_resource_type: params.type,
    p_amount: params.amount,
    p_reason: params.reason,
  });

  if (error) {
    console.error("Transaction error:", error);
    throw new Error(error.message || "Transaction failed");
  }

  // RPC 返回格式: { success: boolean, new_balance: number, message?: string }
  if (!data.success) {
    throw new Error(data.message || "Transaction logic failed");
  }

  return { success: true, newBalance: data.new_balance };
}
