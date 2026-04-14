1. 创建了 `/api/chest/list` 接口，用于从 Supabase 数据库中读取用户的宝箱数据（假设表名为 `user_chests`）。
2. 在 `ChestView.tsx` 中添加了 `useEffect`，在组件加载时调用 `/api/chest/list` 接口获取宝箱数据。
3. 根据接口返回的数据，动态生成 `userChests` 数组，如果用户有 10 个普通宝箱，数组中就会有 10 个普通宝箱对象。
4. 修改了宝箱轮盘的渲染逻辑，使用 `userChests` 替代了固定的 `CHEST_TYPES`。
5. 添加了加载状态和空状态的 UI 处理。
