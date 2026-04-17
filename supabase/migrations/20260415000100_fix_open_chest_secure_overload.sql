-- Supabase PostgREST rpc() 对函数重载支持不稳定。
-- 存在同名不同参数类型（text/uuid）的重载时，容易出现 “Could not find the function ... in the schema cache”，导致接口 500。
-- 这里删除旧的 text 版本，保留 uuid 版本（与业务一致）。

DROP FUNCTION IF EXISTS public.open_chest_secure(uuid, text, integer, uuid);

