/**
 * 全局类型定义文件
 * 包含游戏、用户、Telegram 等相关类型
 */

// ============================================
// Telegram 相关类型
// ============================================

/**
 * Telegram 用户信息
 */
export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
}

/**
 * Telegram WebApp 初始化数据
 */
export interface WebAppInitData {
  user?: TelegramUser;
  start_param?: string;
  auth_date: number;
  hash: string;
}

// ============================================
// 游戏相关类型
// ============================================

/**
 * 游戏状态枚举
 */
export enum GameStatus {
  IDLE = 'idle',       // 等待开始
  PLAYING = 'playing', // 进行中
  PAUSED = 'paused',   // 暂停
  GAME_OVER = 'game_over', // 结束
}

/**
 * 游戏难度枚举
 */
export enum GameDifficulty {
  EASY = 'easy',
  NORMAL = 'normal',
  HARD = 'hard',
}

/**
 * 游戏配置接口
 */
export interface GameConfig {
  difficulty: GameDifficulty;
  maxTime: number;      // 最大游戏时间（秒）
  maxLives: number;     // 最大生命数
}

/**
 * 游戏统计接口
 */
export interface GameStats {
  score: number;        // 当前得分
  level: number;        // 当前等级
  lives: number;        // 剩余生命
  timeRemaining: number; // 剩余时间
  combo: number;        // 连击数
}

/**
 * 游戏元素接口
 */
export interface GameElement {
  id: string;
  type: 'target' | 'bonus' | 'trap';
  position: {
    x: number;
    y: number;
  };
  value: number;
  createdAt: number;
}

// ============================================
// 用户相关类型
// ============================================

/**
 * 应用用户接口
 */
export interface AppUser {
  id: string;
  telegramId: number;
  username?: string;
  firstName: string;
  lastName?: string;
  avatarUrl?: string;
  totalScore: number;
  highScore: number;
  gamesPlayed: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * 排行榜条目接口
 */
export interface LeaderboardEntry {
  rank: number;
  user: AppUser;
  score: number;
  playedAt: string;
}

// ============================================
// API 响应类型
// ============================================

/**
 * 标准 API 响应格式
 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

/**
 * 分页响应
 */
export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
