/**
 * Supabase 客户端配置
 * 用于数据库和后端服务交互
 */

import { createClient } from '@supabase/supabase-js';
import type { AppUser, LeaderboardEntry } from '@/types';

// 从环境变量获取配置
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder';

/**
 * Supabase 客户端实例
 * 在服务端和客户端都可以使用
 */
export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

// ============================================
// 用户相关操作
// ============================================

/**
 * 通过 Telegram ID 获取或创建用户
 */
export async function getOrCreateUser(telegramUser: {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
}): Promise<AppUser | null> {
  try {
    // 先尝试查找现有用户
    const { data: existingUser } = await supabase
      .from('users')
      .select('*')
      .eq('telegram_id', telegramUser.id)
      .single();

    if (existingUser) {
      return existingUser as AppUser;
    }

    // 创建新用户
    const { data: newUser, error } = await supabase
      .from('users')
      .insert({
        telegram_id: telegramUser.id,
        first_name: telegramUser.first_name,
        last_name: telegramUser.last_name ?? null,
        username: telegramUser.username ?? null,
        total_score: 0,
        high_score: 0,
        games_played: 0,
      })
      .select()
      .single();

    if (error) {
      console.error('创建用户失败:', error);
      return null;
    }

    return newUser as AppUser;
  } catch (error) {
    console.error('获取/创建用户出错:', error);
    return null;
  }
}

/**
 * 更新用户游戏统计
 */
export async function updateUserStats(
  userId: string,
  score: number
): Promise<boolean> {
  try {
    // 先获取当前用户信息
    const { data: user } = await supabase
      .from('users')
      .select('high_score, games_played, total_score')
      .eq('id', userId)
      .single();

    if (!user) return false;

    const newHighScore = Math.max(user.high_score, score);
    const newTotalScore = user.total_score + score;
    const newGamesPlayed = user.games_played + 1;

    const { error } = await supabase
      .from('users')
      .update({
        high_score: newHighScore,
        total_score: newTotalScore,
        games_played: newGamesPlayed,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);

    if (error) {
      console.error('更新用户统计失败:', error);
      return false;
    }

    // 同时记录到排行榜
    await addLeaderboardEntry(userId, score);

    return true;
  } catch (error) {
    console.error('更新用户统计出错:', error);
    return false;
  }
}

// ============================================
// 排行榜相关操作
// ============================================

/**
 * 添加排行榜记录
 */
export async function addLeaderboardEntry(
  userId: string,
  score: number
): Promise<boolean> {
  try {
    const { error } = await supabase.from('leaderboard').insert({
      user_id: userId,
      score: score,
      played_at: new Date().toISOString(),
    });

    if (error) {
      console.error('添加排行榜记录失败:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('添加排行榜记录出错:', error);
    return false;
  }
}

/**
 * 获取排行榜（前 N 名）
 */
export async function getLeaderboard(
  limit: number = 10
): Promise<LeaderboardEntry[]> {
  try {
    const { data, error } = await supabase
      .from('leaderboard')
      .select(
        `
        score,
        played_at,
        users:user_id (
          id,
          telegram_id,
          username,
          first_name,
          last_name,
          avatar_url,
          total_score,
          high_score,
          games_played,
          created_at,
          updated_at
        )
      `
      )
      .order('score', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('获取排行榜失败:', error);
      return [];
    }

    // 格式化数据并添加排名
    return (data || []).map((entry, index) => ({
      rank: index + 1,
      user: entry.users as unknown as AppUser,
      score: entry.score,
      playedAt: entry.played_at,
    }));
  } catch (error) {
    console.error('获取排行榜出错:', error);
    return [];
  }
}

/**
 * 获取用户个人排名
 */
export async function getUserRank(userId: string): Promise<number> {
  try {
    // 获取用户的最高分
    const { data: userBest } = await supabase
      .from('leaderboard')
      .select('score')
      .eq('user_id', userId)
      .order('score', { ascending: false })
      .limit(1)
      .single();

    if (!userBest) return 0;

    // 计算排名：分数比用户高的记录数 + 1
    const { count, error } = await supabase
      .from('leaderboard')
      .select('*', { count: 'exact', head: true })
      .gt('score', userBest.score);

    if (error) {
      console.error('获取用户排名失败:', error);
      return 0;
    }

    return (count || 0) + 1;
  } catch (error) {
    console.error('获取用户排名出错:', error);
    return 0;
  }
}
