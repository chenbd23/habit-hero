# Licenses and artwork / 许可与图标

Project code and the new geometric HH icon are covered by [MIT](LICENSE).
项目代码和新绘制的几何 HH 图标采用 MIT。旧发布稿中来源未说明的应用图标不再随包分发；新图标源文件和生成器为 `Habit_Hero_h5/public/icons/hero.svg`、`scripts/generate-icons.py`，不引用外部角色或素材。

`Habit_Hero_h5/scripts/notices.mjs` collects the actual installed npm license texts during each build. The production website serves `/third-party-notices.txt`, `/project-license.txt`, and `/node-license.txt`. Do not strip these files or copyright comments when redistributing.
构建时收集实际安装依赖的许可原文，生产站点提供上述三个文件。分发时必须保留它们及代码中的版权注释；第三方作者姓名和版权邮箱属于必要归属信息，不是本项目部署者的私人信息。

Pinned supplemental sources (packages omit standalone license files):

- Vue Devtools API 6.6.4: https://github.com/vuejs/devtools-v6/blob/v6.6.4/LICENSE
- dlv 1.1.3 (MIT terms reproduced from its license declaration, with author attribution from package metadata; historical license URL now redirects to unrelated content): https://github.com/developit/dlv/blob/1.1.3/README.md links to https://oss.ninja/mit/developit/
- esbuild and Rollup platform binary packages use the license shipped with their matching wrapper package; these build binaries are not copied to the web runtime image.
- Node.js 24.22.1: https://github.com/nodejs/node/blob/v24.22.1/LICENSE (includes bundled component notices).
- Base container OS notices remain in `/usr/share/doc/*/copyright`; Caddy is a separately distributed upstream image, Apache-2.0: https://github.com/caddyserver/caddy/blob/master/LICENSE.

The dependency notice file includes development packages too. The npm lockfile records exact versions and integrity hashes. Rebuild notices whenever dependencies change.
许可汇总也包含开发依赖，锁文件记录准确版本和完整性哈希；更新依赖后须重新生成许可汇总。
