在 Telegram Mini App 里做“分享 TMA / 邀请好友”，功能的实现方式：

1）深链接邀请（Referral Link）：t.me + startapp（最常用、最好做归因）
做法：生成邀请链接，让用户转发给好友。好友点开后进入你的 Mini App，邀请参数会被带入。
参数承载：链接里的 startapp=xxx 会在 Mini App 侧进入：
initDataUnsafe.start_param
URL 的 tgWebAppStartParam
优势：
最适合拉新/归因（邀请人是谁、活动是哪一期、渠道是什么都能编码到 startapp）。
可在任何聊天/群里传播（就是普通 t.me 链接）。
限制/注意：
startapp 长度有限且明文可见，不要放敏感信息，建议放短码/一次性 token（服务端映射）。
必须在服务端校验 initData，不要信 initDataUnsafe（官方明确提示 “Data … should not be trusted”）。
官方文档位置：Telegram Web Apps / Mini Apps 的 “Direct Link / main Mini App … startapp … start_param … tgWebAppStartParam” 段落，及 “Validating data received via the Mini App” 段落（见 https://core.telegram.org/bots/webapps）。

2）原生“分享消息/媒体”对话框：WebApp.shareMessage(msg_id)（分享体验最好，但需要 Bot 侧配合）
做法：在 Mini App 内点“分享/邀请”，弹出 Telegram 原生分享面板，把一条由 Bot 预先准备的消息分享给任意聊天。
关键点：
shareMessage 需要传入 msg_id，且该消息必须来自 Bot API 的 savePreparedInlineMessage 返回的 PreparedInlineMessage。
可监听 shareMessageSent / shareMessageFailed 事件。
优势：
用户体验最“原生”（系统分享面板）。
适合分享：带图片/海报/邀请码的“邀请卡片”、活动素材等。
限制/注意：
需要 Bot API 参与准备消息（不是纯前端就能完成）。
分享的是“消息内容”，不是直接把对方拉进你某个页面；通常仍需在消息里放 你的 startapp 邀请链接 才能完成归因闭环。
官方文档位置：同一页的 “Media Sharing … Added the method shareMessage …” 与方法表（见 https://core.telegram.org/bots/webapps）。
同类能力：WebApp.shareToStory(media_url, …) 更偏“发 Story”，用于传播但邀请归因通常仍靠链接（见同页方法表）。


关键区别总结
要做邀请归因/拉新：优先 startapp 深链接（1），再叠加 shareMessage（2）做更好看的“邀请卡片”，卡片里放 startapp 链接闭环。
安全与一致性提醒（邀请功能最容易被刷）
不要信 initDataUnsafe；邀请参数/用户身份必须以 服务端校验 Telegram.WebApp.initData 为准（官方在同页明确提示要校验）。
邀请入库要做 幂等：例如对 (inviter_user_id, invitee_user_id) 或 (invitee_user_id) 做唯一约束/去重，避免重复领奖。