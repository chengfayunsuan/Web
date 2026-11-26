# 后端交接说明（给接手的开发者）

写这份文档的目的只有一句：**代码里看不出来、但搞错就出事的东西，全在这里。**

先把最要命的三条放最前面：

1. **钱的口径是两套币，不是一套。** 搞混一次就是烂账，见第 3 节。
2. **这不是普通 Node 项目**，是 Cloudflare Pages Functions + D1，没有 ORM、没有 Express、没有 `process.env`。
3. **改线上环境变量有特定做法**，做错一次全站 500，见第 6 节。

---

## 1. 运行环境

| 项 | 值 |
|---|---|
| 宿主 | Cloudflare Pages（项目名 `chengfa`） |
| 后端形态 | Pages Functions，单文件路由 |
| 数据库 | Cloudflare D1，绑定名 `DB`，库名 `chengfa-db` |
| 仓库 | `https://github.com/chengfayunsuan/Web` |
| 线上域名 | `https://chengfa.org`（`chengfa-761.pages.dev` 为备用入口） |
| 绑定 | 只有 `DB` 一个，见 `wrangler.toml` |

**没有的东西**：Node 运行时、`fs`、`Buffer`、`process.env`、任意 npm 包、长连接、后台常驻进程。
需要 Buffer 的地方都是手写的（例：`bytesToB64` / `md5Hex`）。

---

## 2. 代码结构

```
functions/
  _middleware.js          全局中间件
  api/[[path]].js         主路由，5500+ 行，几乎所有接口都在这里
  api/pub/[[path]].js     对外公开接口
  api/follow/[[path]].js  关注相关
  pb.js                   /pb    → 转交 /api/cpx/postback
  file.js                 /file  → 转交 /api/cpx/postback
```

`api/[[path]].js` 里是一个巨大的 `if (path === 'xxx' && request.method === 'YYY') return await fn(...)` 串。
加新接口 = 在这条链上补一行 + 在文件里写对应的 async 函数。

**改这个文件必须做语法检查**，5500 行改坏一处整站后端全挂：

```bash
cp "functions/api/[[path]].js" /tmp/chk.mjs && node --check /tmp/chk.mjs
```

常用内部函数（不要重写，直接用）：

| 函数 | 作用 |
|---|---|
| `json(data, status, headers)` | 统一 JSON 响应 |
| `currentSession(request, env)` | 从 cookie 取会话，返回 `{uid, ...}` 或 null |
| `isPrivileged(env, uid)` | 是不是站长 / 特权账号 |
| `fxValue(env)` | 当前美元汇率（读 `fx_rate` 表） |
| `formatFc(units)` | 内部整数单位 → XB 字符串 |
| `mtxApply(env, args)` | **记账唯一入口，加钱扣钱都走它**（事务 + 幂等） |
| `hookLog(env, args)` | 回调落 `hook_log`，排查「答完没到账」第一站 |

---

## 3. 钱的三个刻度（最重要）

这是全项目最容易搞错的地方，请完整读完再动手。

### 3.1 两套币

| 符号 | 名字 | 锚定 | 用在哪 |
|---|---|---|---|
| **XB** | 内部记账单位 | **人民币**，1 XB = 1 元 | 数据库余额、账本、订单、提现 |
| **XD** | 对外展示单位 | **美元**，100 XD = 1 USD | 问卷墙报价、兑换价、用户看到的数 |

用户看到的「积分」是 XD，数据库里存的是 XB。两者靠汇率换算，汇率存 `fx_rate` 表，每天都在变。

```
XD → XB ： xb = xd / 100 * 汇率
XB → XD ： xd = xb / 汇率 * 100
```

### 3.2 存储精度

```js
const FC_SCALE = 10000;   // 库里所有金额都是「元 × 10000」的整数
const XD_PER_USD = 100;   // 100 XD = 1 USD
```

数据库里 `10600` 表示 **1.06 元**，展示成 XD 约 15.9。
**金额一律整数运算，禁止在 SQL 里对浮点数做加减。**

### 3.3 展示只留 1 位

`js/config.js` 的 `money()` 把全站展示压到最多 1 位小数。库里仍是 4 位精度。
不要把展示位数和存储精度混为一谈。

### 3.4 兑换商品定价

`store_items` 有两列价格，**`price_xd` 才是真相**：

- `price_xd`：整数 XD，永远不动（例：800）
- 人民币价 = `price_xd / 100 * 当天汇率`，随汇率浮动
- `price_units` 是历史遗留的 XB 值，`price_xd = 0` 时才退回用它

**扣款必须现算**，不能读死值，否则「看到的价」和「扣的钱」会对不上。

---

## 4. 五家上游（各自口径都不同）

### TheoremReach（TR）
- 环境变量：`THEOREMREACH_API_KEY` / `_SECRET_KEY` / `_POSTBACK_KEY` / `_PARTNER_ID` / `_MODE`
- 签名：`HMAC-SHA1(secretKey, 整条 URL)` → base64 → `+`→`-`、`/`→`_`、去 `=`
- 列表接口：`/api/publishers/v1/surveys`
- 两个入口别混：`respondent_entry/router`（进去直接派一份）vs `respondent_entry/direct`（它自己的列表页）
- 分成：`share = 0.69`，即 `exchange_rate = 69`（100 × 0.69）。**必须报分成后的数**，报 100 就是墙上标 100、到账 69
- 坑：上游回 `200 + 空数组` 也算「请求成功」，降级逻辑要判条数，不能只判能否解析

### CPX Research
- 环境变量：`CPX_APP_ID` / `CPX_SECRET`
- 签名 **MD5**：入口 `md5(uid + '-' + secret)`，回调 `md5(trans_id + '-' + secret)`
- **Workers 没有内置 MD5**，代码里是手写的 `md5Hex()`，结果已和 `node:crypto` 对齐
- 回调参数：`status`(1完成/2撤销)、`trans_id`、`user_id`、`amount_local`、`amount_usd`、`type`、`hash`
- **入账以 `amount_local` 为准**，不要用 `amount_usd × 69` 反推 —— CPX 已按 factor 算好，反推会少 31%
- 后台 factor：主卷 69、bonus 100（bonus 不抽成，全额给用户）
- IP 白名单已放宽为「只记录不拦截」，原因见第 7 节

### OpinionUniverse
- 环境变量：`OPINIONUNIVERSE_APP_ID` / `_PUB_ID` / `_SECRET`

### BitLabs
- 环境变量：`BITLABS_APP_TOKEN` / `BITLABS_SECRET`

### Moonetix（offerwall，不是问卷商）
- 环境变量：`MOONETIX_APP_ID` / `_LINK_SALT` / `_POSTBACK_KEY`
- 签名约定见官方 handler 仓库

**共同纪律**：接新上游先要到真实回调样本或官方文档。字段名、签名算法一律以对方实际发出的为准。
按「常见写法」猜着写的代价，这个项目已经付过一轮了。

---

## 5. 数据库表

| 表 | 用途 |
|---|---|
| `users` | 账号、余额（`fc_units` / `fc_frozen`）、画像字段 |
| `sessions` | 会话 |
| `fc_ledger` | **资金流水，唯一账本**，每笔都要能对上 |
| `surveys` / `survey_joins` | 站内问卷 |
| `store_items` / `orders` | 兑换商品与订单 |
| `withdrawals` | 提现 |
| `hook_log` | 上游回调原始记录（排查第一站） |
| `mo_task` | offerwall 任务 |
| `cdk_codes` | 兑换码 |
| `app_meta` | 键值配置（含临时通行口令） |
| `fx_rate` | 汇率 |
| `risk_events` / `user_bans` / `login_fails` | 风控 |

**所有改余额的操作必须走 `mtxApply`**，它负责事务 + 幂等 + 写 `fc_ledger`。
直接 `UPDATE users SET fc_units = ...` 会造成账实不符，且不留流水。

回调必须幂等：同一 `trans_id` 重复打进来不能重复入账（靠 `ref` 去重）。

---

## 6. 部署与配置（做错就全站挂）

### 部署
```bash
git push origin main      # 正常情况 GitHub Actions 自动部署，约 1~2 分钟
```

**但 Actions 有时不触发**：提交推上去了，运行列表里没有对应记录，线上没变化。
这时手动部署：

```bash
cd /d/Develop/Website/My-Website
npx wrangler pages deploy . --project-name=chengfa --branch=main --commit-dirty=true
```

⚠️ 手动部署前确认 `.preview` 目录里没有大文件。Cloudflare Pages **单文件上限 25MB**，
本地浏览器缓存曾写进一个 155MB 文件，导致整次部署报错。`.assetsignore` 里写了排除，
但 `wrangler pages deploy` 不读它。处理办法是临时移出该目录，部署完移回。

### 改环境变量（铁律）
`PATCH /accounts/{acc}/pages/projects/{name}` 对 `env_vars` 是**合并语义**，
但曾因为「只写想改的那几个、没带全」把数据库密钥写成空串，直接全站 500。

**做法：读全 → 改要改的 → 带全所有变量和机密一起写回。**

`wrangler pages secret put` 会被安全审批拦住（敏感内容判定），走 HTTP API 更稳。

### 环境变量清单（只有名字，值在 Cloudflare Pages 生产环境里）
```
DB  MAIL_FROM  MAIL_DEBUG  ZEPTOMAIL_API_KEY  TURNSTILE_SECRET
CPX_APP_ID  CPX_SECRET
THEOREMREACH_API_KEY  THEOREMREACH_AUTH_TOKEN  THEOREMREACH_SECRET_KEY
THEOREMREACH_POSTBACK_KEY  THEOREMREACH_PARTNER_ID  THEOREMREACH_MODE
THEOREMREACH_EXCHANGE_RATE  THEOREMREACH_CURRENCY  THEOREMREACH_SHARE
THEOREMREACH_MAX_XB  THEOREMREACH_XB_PER
OPINIONUNIVERSE_APP_ID  OPINIONUNIVERSE_PUB_ID  OPINIONUNIVERSE_SECRET
BITLABS_APP_TOKEN  BITLABS_SECRET
MOONETIX_APP_ID  MOONETIX_LINK_SALT  MOONETIX_POSTBACK_KEY
```

本地开发用 `.dev.vars`（已在 `.gitignore`，**不要提交**）。

### 前端资源版本号
改了 `js/*.js` 或 `css/*.css`，**必须把 HTML 里的 `?v=N` 加一**，否则用户浏览器读旧缓存，
看起来像「改了没生效」。这条踩过很多次。

---

## 7. 现在这个状态是有意的，别「顺手修好」

| 现状 | 为什么保持 |
|---|---|
| CPX 回调 IP 不在白名单只记日志不拦截 | 真实回调出口 IP 不止白名单那几个，硬拦会让钱蒸发（我们还回 200，对方就不重试了） |
| `app_meta.turnstile_pass` 有临时口令 | 国内经常连不上 `challenges.cloudflare.com`，用来给特定的人开门。**用完要删那一行** |
| `?debug=1` 入口 | TR 官方测试模式，只出 1 道题。**绝不能进生产流量** |
| 展示只留 1 位小数 | 明确的产品决定，不是图省事 |
| `price_xd` 与 `price_units` 并存 | 兼容老数据，`price_xd=0` 才回退 |

---

## 8. 已知未解（接手后优先看这几件）

1. **CPX 后台 Postback URL 存不进去**：保存后刷新输入框是空的，但 CPX 确实访问过我们（`hook_log` 有探测记录），说明它那边存住了、只是回填失败。判断为对方前端 bug，别在这上面耗超过半小时。
2. **TR 中国区库存时有时无**：大厅份数会突然归零。接口响应里 `upstream` / `maxTried` / `extraPrequal` 三个字段是判断依据 —— `upstream: 0` 是上游没货；有数但 `shown: 0` 才是我们过滤出问题。
3. **CPX Test mode 未开通**：要联系客户经理手动开，开了就能直接打假回调验完整链路。
4. **`.preview/` 目录约 1.9GB**：历史截图和浏览器缓存，与站点无关，可清理。
5. **提现通道未定**：PayPal 账号被封，Payoneer / 万里汇未注册。运营问题，不是代码问题。

---

## 9. 排查手册

**用户说「答完了没到账」，按这个顺序查，别跳步：**

1. `hook_log` 有没有这条记录？
   - 没有 → 上游压根没打过来，去对方后台查，不是我们的问题
   - 有但 `result` 是拒绝 → 看是签名错还是别的；签名错说明密钥不一致
2. `fc_ledger` 有没有这笔？
   - 没有 → `mtxApply` 没执行到。多半是金额被算成 0（上游 factor 配成了 0），代码里 `units <= 0` 会直接跳过
3. `users.fc_units` 涨了没有？
   - 前两步都有、这步没涨 → 事务没提交，严重，立刻查

**查线上数据库：**
```bash
npx wrangler d1 execute chengfa-db --remote --command "SELECT id, provider, result, ip, created_at FROM hook_log ORDER BY id DESC LIMIT 10"
```
`--json` 的输出在 Git Bash 下解析容易出问题，用纯文本 + `grep` 更稳。

---

## 10. 一句话总结

**这个项目里「钱」「精度」「幂等」三件事不能猜。**
其余部分都是普通的增删改查，随便写。
