# CPX 问卷列表接入 · 交接说明

> 给接手 CPX 那段代码的人。只讲这一件事：**在大厅里摆出 CPX 的真实问卷库存**。
> 站内其他部分（登录、余额、回调入账）都已经跑通，不要动。
>
> 仓库：`chengfayunsuan/Web`，后端全在一个文件：`functions/api/[[path]].js`（5500+ 行 if 链）。

---

## 0. 一句话目标

加一个 `GET /api/surveys/cpx`，返回和 `/api/surveys/tr` **完全同构**的 JSON，让现有大厅前端不用改就能渲染。

---

## 1. 官方文档：只有一页，而且不全

<https://www.cpx-research.com/main/en/doc.php>

**这页有的**：四种接入方式（Script / IFrame / SDK / API）、`get-surveys` 的请求参数表、返回字段表、一段 PHP 示例。

**这页没有的**（别以为漏看了，是真没有）：

| 缺什么 | 去哪拿 |
|---|---|
| postback 的字段名、验签算法 | publisher 后台 → Postback Settings；或者直接看本仓库 `cpxPostback`（2075 行），那是按真实回调调通的 |
| 错误码列表 | 没有。只能实测 |
| IP 白名单 | 全文没提。我们的实现是**只记录不拦**（见 `cpxPostback` 2098-2107 的注释），别改成硬拦 |
| 正式的签名章节 | 只有一句 PHP 示例 |

文档自己还有两处矛盾：`subid_1` 标 Mandatory 但描述说可选；质量分表头写 `quality_score`、示例里用 `score`。**两处都按“两个键都读、读不到就用默认值”处理**，不要二选一。

---

## 2. 现状：哪些已经有，哪些要你写

| 功能 | 状态 | 位置 |
|---|---|---|
| 入口跳转 `/api/cpx/go` | 已上线 | `cpxGo` 2042 行 |
| 回调入账 `/api/cpx/postback` | 已上线，真实入账验证过 | `cpxPostback` 2075 行 |
| 问卷列表 `get-surveys` | **没做，就是你的活** | 新增 |
| 环境变量 `CPX_APP_ID` / `CPX_SECRET` | 已配在 Cloudflare Pages | 后台 Variables and Secrets |

入口和回调已经跑通，说明 `app_id`、`secure_hash`、金额口径都是对的。你只需要把列表拉回来、映射成下面的契约。

---

## 3. 要写的函数

### 3.1 路由

在 `[[path]].js` 的路由段（第 57 行 `surveys/tr` 旁边）加一行：

```js
if (path === 'surveys/cpx' && request.method === 'GET') return await cpxSurveyList(request, env);
```

### 3.2 骨架

```js
/* CPX 问卷列表：GET /api/surveys/cpx
   和大厅里 TR 那条同构，前端才能无感切换。 */
async function cpxSurveyList(request, env) {
  /* 三道门必须和 trSurveyList 一模一样，少一道就是漏洞 */
  const session = await currentSession(request, env);
  if (!session) return json({ ok: false, error: 'unauthorized' }, 401);
  if (!isActive(session)) return locked();
  if (await wallBlocked(env, session.uid)) return json({ ok: false, error: 'email_unverified' }, 403);

  const c = cpxConf(env);
  if (!c.appId || !c.secret) return json({ ok: true, items: [], note: 'not_configured' });

  const uid = String(session.uid);
  const ip = String(request.headers.get('CF-Connecting-IP') || '').trim();
  if (!ip) return json({ ok: false, error: 'no_ip' }, 400);

  /* TODO: 按第 4 节的参数拉 get-surveys
     TODO: 按第 5 节的契约映射成 items
     TODO: 任何失败都返回 { ok: true, items: [] }，不要返回 5xx
           —— 大厅拿不到会自己退回站内问卷，返回 5xx 只会让前端报错 */

  return json({ ok: true, items: items, count: items.length, upstream: rawCount });
}
```

### 3.3 请求参数

```
GET https://live-api.cpx-research.com/api/get-surveys.php
  ?app_id={env.CPX_APP_ID}
  &ext_user_id={站内 uid}
  &output_method=api          ← 固定值，写死
  &ip_user={CF-Connecting-IP}
  &user_agent={request 的 User-Agent}
  &limit=30
  &secure_hash={md5(uid + '-' + env.CPX_SECRET)}
```

几个要点：

- `ip_user` **必填**。Cloudflare 上是 `request.headers.get('CF-Connecting-IP')`，不是 `X-Forwarded-For`。缺了直接拉不到卷。
- `user_agent` 文档标 Optional，但设备适配靠它，建议传 `request.headers.get('User-Agent')`。
- `limit` 默认只有 12，大厅要铺满就得往上调。上限文档没写，先用 30，拿不到再降。
- `ext_user_id` **必须等于站内 uid**，永远不变。回调靠它认人，变了就是钱记到别人头上。
- `output_method=api` 不能改，改了返回的是 HTML 不是 JSON。

---

## 4. 返回契约（这一段最重要，改一个字段前端就白屏）

```json
{
  "ok": true,
  "items": [ ... ],
  "count": 12,
  "country": "CN",
  "upstream": 37,
  "shown": 12
}
```

`items[]` 每一项：

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | string | **必须带前缀**，用 `'cpx-' + 上游 id`。大厅靠前缀区分来源、去重 |
| `provider` | string | 固定 `'CPX Research'`，前端按这个名字选图标 |
| `title` | string | 上游没有标题，用 `'问卷 #' + id`，和 TR 一致 |
| `topic` | string | 粗档位标签，按 `loi` 分：`<=5` 快速 / `<=12` 常规 / 其余 深度 |
| `price` | string | **XB 口径（元），4 位精度全保留**，见第 6 节。不是数字类型，是 `formatFc()` 出来的字符串 |
| `durationMin` | number | 上游 `loi`，分钟 |
| `stars` | number | `statistics_rating_avg` 四舍五入，1–5，没有就 0 |
| `incidence` | number | 上游没这个字段就填 0；有就填百分比整数。前端「发生率」列排序要用 |
| `grade` | string | 留空 `''` |
| `requirement` | string | 一句话说明。建议 `'通过率 ' + x + '%'`，没有就 `'CPX 问卷'` |
| `entry` | string | 上游 `href`，**原样透传，不要重编码、不要拼参数** |
| `featured` | boolean | `top === 1` 时为 `true` |
| `createdAt` | string | 用 `String(99999999 - i)`，i 是上游数组下标。前端「时间·最新」靠它排 |

**不要新增字段、不要改字段名。** 前端 `js/app.js` 是按这套写死的（渲染在 200–390 行，排序在 470–490 行）。

### 4.1 `href` 的三个禁区

1. **不能跨用户复用**。CPX 明确写了这是 user-based API，`href` 只对当次 `ext_user_id` 有效。绝对不能缓存起来给第二个用户。
2. **不要重新拼参数**。上游链接里的参数顺序和编码都是它签好的，动一个字符就可能失效。要加东西只能往后追加。
3. **不要做 URL 白名单校验后丢给前端**——前端只用它做 `location.href`，没别的处理。

---

## 5. 两套签名不是一套（最容易搞错的地方）

| 场景 | 签名对象 | 公式 |
|---|---|---|
| 拉列表 `get-surveys` | 用户 id | `md5(ext_user_id + '-' + secret)` |
| 回调 `postback` | 交易号 | `md5(trans_id + '-' + secret)` |

文档把这两件事混在一段里写，照着抄很容易两边写成一个，然后**回调全部验签失败、钱一分都进不来**。

本仓库已有现成实现，直接用：

- `md5Hex()` —— 1220 行，返回 32 位小写十六进制
- 列表侧用法照抄 `cpxGo` 2060 行：`md5Hex(uid + '-' + c.secret)`
- 回调侧已在 `cpxPostback` 2096 行：`md5Hex(tid + '-' + c.secret)`

---

## 6. 金额口径：一处算错就是全员烂账

### 6.1 币种刻度

```
XB   站内记账，锚人民币，1 XB = 1 元，库里乘 10000 存整数（FC_SCALE）
XD   对外展示，锚美元，100 XD = 1 USD
```

`price` 字段一律是 **XB 口径**，前端自己按当前汇率换成 XD 显示。

### 6.2 开工前必须先实测这一件事

CPX 返回两个金额：`payout`（标称“本地货币”）和 `payout_publisher_usd`（美元）。**先用一个真实账号打一次请求，把两个数的比值算出来**：

- 比值约等于 **69**（即 `payout / payout_publisher_usd ≈ 69`）→ 说明后台已经把 69% 分成和 XD 汇率都算进 `payout` 了，`payout` 可以直接当 XD 用。
- 是别的数 → 说明 `payout` 是别的币种或毛额，得自己折算。

**我们的回调侧实现是这么算的**（`cpxPostback` 2134-2139 行，注释写得很清楚）：

```
units = |amount_local| / 100 * fx * 10000
```

也就是把 `amount_local` 当 XD、**没有再乘 0.69**。因为这个 69% 是 CPX 侧算好的：主卷 factor=69，bonus factor=100，各自都已经落进 `amount_local`。

### 6.3 所以列表侧

对齐回调，别再抽一次：

```js
/* payout 是 XD 口径时 */
const xb = Number(s.payout) / XD_PER_USD * fx;          // XD → XB
price = formatFc(Math.round(xb * FC_SCALE));
```

**绝对不要写成 `* c.share`。** TR 那条要乘 0.69，是因为 TR 给的是毛美元；CPX 的 `payout` 已经是分成后的数，再乘一次就等于抽两遍，用户少拿 31%。这是照抄 `trSurveyList` 最容易踩的坑。

`fx` 用现成的 `await fxValue(env)`（3048 行）。

---

## 7. 缓存与刷新

文档规定：**列表缓存不得超过 120 秒**，且 `href` 与用户绑定。

结论：**不要做任何持久缓存**（D1 / KV / Cache API 都别用）。每次请求现拉。Cloudflare 的 edge cache 也不要用，否则会把 A 用户的 `href` 给到 B 用户。

如果上游慢，加个 3 秒超时兜底，超时就返回空列表，让大厅退回站内问卷。

---

## 8. 错误处理

| 情况 | 返回 |
|---|---|
| 没配 `CPX_APP_ID` / `CPX_SECRET` | `{ ok: true, items: [], note: 'not_configured' }` |
| 上游非 2xx / 超时 / JSON 解析失败 | `{ ok: true, items: [], note: 'upstream_error' }`，`console.error` 记下状态码和响应前 160 字 |
| 上游 `status !== 'success'` | 同上，把 `status` 原值记进 note |
| 上游返回 `surveys: []` | `{ ok: true, items: [] }`，这是真的没库存，正常 |

**一律不要返回 5xx。** 大厅 `loadAll()`（`js/app.js` 605 行）的逻辑是：`/api/surveys/tr` 拿不到就退回站内问卷。你返回 500，前端只会当成网络错误，体验更差。

---

## 9. 变量与密钥

- `CPX_APP_ID`、`CPX_SECRET` 在 **Cloudflare Pages → 项目 chengfa → Settings → Variables and Secrets → Production**，类型是 Secret。
- 代码里只准写 `env.CPX_APP_ID` / `env.CPX_SECRET`。
- **不要**把值写进任何文件，不要写进 `.dev.vars` 以外的本地文件，不要提交。
- `.dev.vars` 已在 `.gitignore` 第 24 行，不会进仓库。

---

## 10. 自测清单（交付前逐条过）

1. `curl -i https://chengfa.org/api/surveys/cpx` 未登录 → 401，不是 500。
2. 登录后请求 → `ok: true`，`items.length > 0`，每个 item 字段齐全。
3. 把返回的第一个 `entry` 贴到浏览器 → 能进 CPX 的卷。
4. 同一账号连拉两次，`href` 里带的 `ext_user_id` 一致；换账号再拉，`href` 必须变。
5. 断网 / 改错 `app_id` 模拟失败 → 返回 `ok: true, items: []`，大厅不白屏。
6. 大厅页（`/hall`）在 390px 宽度下卡片不溢出（浏览器 DevTools 切设备，别用 Edge headless 的 `--window-size`，那个数值是假的）。
7. 用真实账号完整做一份卷，等回调，核对 `hook_log` 的 `amount_local` 和 `fc_ledger` 的 `delta` 是否对得上（`delta / 10000 = amount_local / 100 * fx`）。

---

## 11. 不要做的事

- 不要改前端字段名、不要给 `items` 加字段。
- 不要在列表接口里写任何余额相关逻辑（余额只走 `mtxApply`）。
- 不要顺手“优化” `cpxGo` / `cpxPostback`，那两个是调通的。
- 不要把 CPX 的 `href` 存进数据库，也不要做「一批拉下来慢慢发」。
- 不要为了通过测试把 `ip_user` 写死成某个 IP，`country` 匹配会全错。

---

## 12. 合入方式

这份文档可以只读，不需要仓库写权限。写完把 `cpxSurveyList` 整个函数 + 那一行路由贴过来就行，剩下的合并、部署、上线由站内那边统一做。

CPX 后台的 `app_id` 和 `secure_hash` 在 publisher 账号里，需要的话单独发，不走文档。
