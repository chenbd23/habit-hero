# Security / 安全

This review candidate is intended for self-hosted, trusted households. Use HTTPS remotely, keep parent devices private, preserve backups, and update Node, base images, and npm dependencies regularly. The active release line is H5 3.2.x / server 3.1.x; older copies have known issues described in the release notes.
本审阅版本用于受控家庭自托管。远程使用 HTTPS，保护家长设备，保存备份并定期更新运行时、镜像与依赖。维护基线为 H5 3.2.x / 服务端 3.1.x；旧副本存在已知问题。

Do not post passwords, tokens, deployment keys, real family data, or exploitable vulnerability details in public issues. Once the repository is published and private vulnerability reporting is enabled, use its Security → Report a vulnerability page. Until that private channel is available, share only a non-sensitive request for a private contact; do not disclose the exploit publicly. No private reporting channel or response SLA is claimed to be active in this unpublished candidate.
不要在公开 issue 中提交密码、令牌、部署密钥、真实家庭资料或可直接利用的漏洞细节。仓库发布并启用私密漏洞报告后，使用 Security → Report a vulnerability。此入口尚未启用时，只发不含细节的私密联系方式请求。本未发布稿不声称已开通私密报告渠道或响应时限。

A report should identify the version, expected vs actual behavior, a synthetic-data reproduction, impact, and suggested mitigation. Report each affected trust boundary separately. Automated checks are evidence for tested paths, not a guarantee that no vulnerabilities exist.
报告应包含版本、预期和实际行为、合成数据复现、影响与缓解建议。自动测试仅证明已覆盖路径，不能保证没有未知缺陷。
