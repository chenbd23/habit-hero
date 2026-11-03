# Changes / 更新

## H5 3.2.0 · Sync 3.1.0 — 2026-11-03 review candidate

- Controlled registration, server-operator account bootstrap and password recovery; password change, session revocation, and family member management.
- Restricted child device sessions; server-derived task values and reward prices, explicit parent-session removal when switching a shared browser.
- Trusted-proxy client identification, bounded authentication/write limits, family and attachment quotas, low-disk guard, and resource-limited containers.
- Download/archive/disconnect recovery for old browser queues; restore rotates epoch and revokes all saved sessions/invitations. Never automatically replay old spending.
- Node 24.22.1 baseline and refreshed npm lockfile; license notices ship with production artifacts; original reproducible geometric icons replace unverified artwork.
- Bilingual deployment/usage/maintenance instructions, optional starter templates, CI, dependency updates, and regression coverage.

默认注册改为受控，需服务器创建首个账户或有效家庭邀请。新增受限儿童设备；家长页面不再以默认四位 PIN 充当权限保护。补齐改密、会话撤销、成员管理、存储配额和旧浏览器恢复出口。更新运行时与依赖、许可证、原创图标、中英文部署说明和测试。

Upgrade: back up first; generate both internal proxy keys, preserve the Compose project name and database volume, rebuild both services. Restore invalidates every old session and invitation. Parent sessions that existed before upgrading remain administrator sessions until revoked: explicitly switch shared browsers to child mode or revoke sessions. Do not assume an old browser showing the child page has become restricted.
升级前备份，补齐两个内部密钥，保持项目名和数据卷并重建两端。恢复会撤销旧会话与邀请；普通升级不自动撤销原有家长会话，共用浏览器应显式切换儿童模式或撤销会话，不能因为原页面显示儿童界面就认为权限已降低。

No remote publication or deployment is part of this local review candidate.
本候选仅供本地审阅，未发布到远端。
