-- SECURITY: 好友邀请入库 + 幂等去重 + 发奖闭环（RPC 单事务）
-- 目标：
-- 1) invitee 通过 start_param 进入时，服务端可安全入库 inviter->invitee 关系
-- 2) 断网/超时/重试不会重复入库/重复发奖（强幂等）
-- 3) 发奖与资产变更在 DB 事务内完成，避免部分成功导致不一致

-- ========== 1) 幂等索引 ==========
-- 约束：一个被邀请用户（invitee）只能绑定一个邀请人（inviter）
CREATE UNIQUE INDEX IF NOT EXISTS user_invites_unique_invitee
  ON public.user_invites (invitee_user_id);

-- 约束：同一 inviter-invitee 组合不能重复
CREATE UNIQUE INDEX IF NOT EXISTS user_invites_unique_pair
  ON public.user_invites (inviter_user_id, invitee_user_id);

-- 约束：数值奖励（coins/points）每个 invitation 只能发一次
CREATE UNIQUE INDEX IF NOT EXISTS invite_rewards_unique_numeric_once
  ON public.invite_rewards (invitation_id)
  WHERE reward_type IN ('coins', 'points');

-- 约束：物品奖励同一 invitation + item 只能发一次
CREATE UNIQUE INDEX IF NOT EXISTS invite_rewards_unique_item_once
  ON public.invite_rewards (invitation_id, item_id)
  WHERE reward_type = 'item' AND item_id IS NOT NULL;

-- ========== 2) shareMessage msg_id 缓存表 ==========
-- PreparedInlineMessage 的 id（msg_id）由 Bot 侧生成；为了避免每次分享都调用 Bot API，这里做 DB 缓存
CREATE TABLE IF NOT EXISTS public.user_prepared_messages (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  msg_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, kind)
);

CREATE INDEX IF NOT EXISTS user_prepared_messages_user_kind_idx
  ON public.user_prepared_messages (user_id, kind);

-- ========== 3) 邀请接收 + 发奖 RPC ==========
-- 说明：
-- - 服务端调用本函数时必须已校验 Telegram initData，确保 telegram_id 可信
-- - 默认 reward_type=coins；对应游戏货币 balance（由服务端/DB 控制，不信前端）
CREATE OR REPLACE FUNCTION public.accept_invite_and_reward(
  p_inviter_telegram_id bigint,
  p_invitee_telegram_id bigint,
  p_invite_code text,
  p_reward_type text DEFAULT 'coins',
  p_amount bigint DEFAULT 100
) RETURNS json AS $$
DECLARE
  v_inviter_id uuid;
  v_invitee_id uuid;
  v_invitee_games_played bigint;

  v_claimed_invitation_id uuid;
  v_existing_invitation_id uuid;
  v_existing_inviter_id uuid;

  v_reward_claimed_id uuid;
  v_balance_after bigint;
BEGIN
  IF p_inviter_telegram_id IS NULL OR p_invitee_telegram_id IS NULL THEN
    RETURN json_build_object('success', false, 'reason', 'missing_telegram_id');
  END IF;

  IF p_inviter_telegram_id = p_invitee_telegram_id THEN
    -- 自己邀请自己直接忽略（表里也有 check）
    RETURN json_build_object('success', true, 'already_processed', true, 'reason', 'self_invite');
  END IF;

  -- 锁定 invitee 用户行，避免并发重复绑定邀请
  SELECT id, COALESCE(games_played, 0)
    INTO v_invitee_id, v_invitee_games_played
  FROM public.users
  WHERE telegram_id = p_invitee_telegram_id
  FOR UPDATE;

  IF v_invitee_id IS NULL THEN
    RETURN json_build_object('success', false, 'reason', 'invitee_not_found');
  END IF;

  -- inviter 不一定需要 FOR UPDATE（这里只做加币，后面会锁 inviter 行）
  SELECT id INTO v_inviter_id
  FROM public.users
  WHERE telegram_id = p_inviter_telegram_id;

  IF v_inviter_id IS NULL THEN
    RETURN json_build_object('success', false, 'reason', 'inviter_not_found');
  END IF;

  -- 先尝试插入邀请关系（幂等：invitee_user_id 唯一）
  INSERT INTO public.user_invites (
    inviter_user_id,
    invitee_user_id,
    inviter_telegram_id,
    invitee_telegram_id,
    invite_code,
    status,
    qualified_at,
    invitee_games_played_at_invite,
    created_at
  ) VALUES (
    v_inviter_id,
    v_invitee_id,
    p_inviter_telegram_id,
    p_invitee_telegram_id,
    p_invite_code,
    'qualified',
    now(),
    v_invitee_games_played,
    now()
  )
  ON CONFLICT (invitee_user_id) DO NOTHING
  RETURNING id INTO v_claimed_invitation_id;

  IF v_claimed_invitation_id IS NULL THEN
    -- 已存在邀请：读取并锁定该行，确保并发下读一致
    SELECT id, inviter_user_id
      INTO v_existing_invitation_id, v_existing_inviter_id
    FROM public.user_invites
    WHERE invitee_user_id = v_invitee_id
    FOR UPDATE;

    -- 如果该 invitee 已经被其他 inviter 绑定，则直接视为已处理，不再发奖
    RETURN json_build_object(
      'success', true,
      'already_processed', true,
      'invitation_id', v_existing_invitation_id,
      'bound_to_inviter', v_existing_inviter_id
    );
  END IF;

  -- 发奖：目前实现 coins/points（amount>0）给 inviter 的 balance
  IF p_reward_type NOT IN ('coins', 'points') THEN
    -- 先把邀请关系写入成功，但不发不支持的奖励类型
    RETURN json_build_object('success', true, 'already_processed', false, 'invitation_id', v_claimed_invitation_id, 'reward_granted', false);
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN json_build_object('success', true, 'already_processed', false, 'invitation_id', v_claimed_invitation_id, 'reward_granted', false);
  END IF;

  -- 锁 inviter 行，进行加币
  PERFORM 1 FROM public.users WHERE id = v_inviter_id FOR UPDATE;

  UPDATE public.users
  SET balance = balance + p_amount
  WHERE id = v_inviter_id
  RETURNING balance INTO v_balance_after;

  -- 写奖励记录（partial unique index 确保同一 invitation 只发一次）
  INSERT INTO public.invite_rewards (
    invitation_id,
    inviter_user_id,
    invitee_user_id,
    reward_type,
    amount,
    status,
    granted_at,
    created_at
  ) VALUES (
    v_claimed_invitation_id,
    v_inviter_id,
    v_invitee_id,
    p_reward_type,
    p_amount,
    'granted',
    now(),
    now()
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_reward_claimed_id;

  RETURN json_build_object(
    'success', true,
    'already_processed', false,
    'invitation_id', v_claimed_invitation_id,
    'reward_granted', (v_reward_claimed_id IS NOT NULL),
    'balance_after', v_balance_after
  );
END;
$$ LANGUAGE plpgsql;

