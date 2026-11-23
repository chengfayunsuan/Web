# 乘法 · Chengfa

问卷与任务返利站。用户做问卷、任务墙攒积分，兑换成支付宝提现或卡密。

线上：<https://chengfa.org>（Cloudflare Pages，仓库 `main` 分支自动部署）

---

## 技术栈

| 层 | 用的什么 |
|---|---|
| 前端 | 原生 HTML / CSS / JS，无框架无构建 |
| 接口 | Cloudflare Pages Functions（`functions/`，单文件路由） |
| 数据库 | Cloudflare D1（SQLite） |
| 媒体 | Cloudflare R2（`/api/pub` 分发） |

## 目录

```
index.html            落地页（未登录访客看到的）
404.html              错误页，后台未授权也用它伪装
_redirects            短链 → pages/ 的真实文件，改地址先改这里
_headers              全局安全头
wrangler.toml         Pages 项目配置

pages/                所有页面（33 个，地址靠 _redirects 映射）
en/                   英文站，与中文页共用同一套脚本
css/  js/  fonts/     静态资源
i18n/zh-en.jsonl      英文文案源
tools/build-en.mjs    生成 en/ 的脚本

functions/
  _middleware.js      访问计数、后台权限守卫
  api/[[path]].js     主接口（路由、账号、问卷、兑换、提现、后台、各墙回调）
  api/follow/         关注关系
  api/pub/            公开媒体分发

db/                   schema.sql 建表 + migrate-*.sql 增量迁移
```

## 本地跑

```bash
npx wrangler pages dev . --port 8788 --d1 DB=chengfa-db --local
```

本地数据库在 `.wrangler/state/`，与线上完全隔离。要造数据用 `db/schema.sql` 初始化，
或从线上导。

改完页面记得升脚本缓存号（`config.js?v=`、`app.js?v=` 之类），浏览器按 URL 缓存，
不升版本改了也不生效。批量改：

```bash
grep -rl "app.js?v=28" pages en *.html | xargs sed -i 's/app.js?v=28/app.js?v=29/g'
```

## 部署

推 `main` 就部署，没有别的步骤。

**改环境变量必须两步**：PATCH Cloudflare API 写入 + 重新部署（推空提交）。只写不部署，
函数运行时拿不到新值——这个坑踩过三次。

当前需要的变量（值不写在仓库里）：

```
DB                     D1 绑定（wrangler.toml 里配）
TURNSTILE_SECRET       人机验证，缺了注册登录全挂
ZEPTOMAIL_API_KEY      发信，缺了收不到验证码
MAIL_FROM              发信人，形如 Chengfa <noreply@chengfa.org>
THEOREMREACH_API_KEY   TheoremReach 问卷墙
THEOREMREACH_SECRET_KEY
OPINIONUNIVERSE_SECRET OpinionUniverse 任务墙回传验签
BITLABS_SECRET         BitLabs 问卷墙回传验签
BITLABS_APP_TOKEN      BitLabs 入口令牌
```

所有变量一律用 `secret_text`。用 `plain_text` 写的，下一次只带其他变量的 PATCH 会把它抹掉。

## 数据迁移

`db/schema.sql` 是某个时点的完整快照，之后每项改动都追加一个 `migrate-0NN.sql`。
新环境按 `schema.sql` 建库，再按编号顺序补迁移；不要回头改历史迁移文件。

## 几个容易踩的点

- **XB 与 XD**：`fc_units` / `fc_ledger` 存的是 XB（锚人民币，1 XB = 1 元），
  余额、提现、兑换全用它。XD 是显示单位（100 XD = 1 USD），只在渲染时按汇率算，
  不存在第二套账本。第三方墙回传的 `reward` 多为 XD，入账前要除以 100 再乘汇率。
- **第三方回传**：一律先验签再入账，回传里带的美元只记流水做对账，不发进用户余额。
- **同一条回传重放**：靠交易号幂等，重复推不入第二次；冲正按原单金额扣回，可扣成负数。
- **后台路径**：`/admin*` 未授权返回伪 404，不给"这里有个后台"的提示。
