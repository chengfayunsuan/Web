/**
 * 和 CPX 后台示例同形的回调入口：/file
 *
 * 后台的 Main Postback URL 字段一直判 "Your Postback URL is wrong!"，
 * 而把示例原样粘进去是能过的。示例的形态是：
 *   https://www.your-domain.com/file?status=...
 * 也就是说它可能只认「/file」这个路径名。这里把 /file 做成真实函数
 * （_redirects 的 200 改写进不了 Functions，实测 404），转交给同一个处理函数。
 *
 * 参数一个不少地由 CPX 带过来，这里只改 pathname。
 */

import { onRequest as api } from './api/[[path]].js';

export async function onRequest(context) {
  const src = context.request;
  const url = new URL(src.url);
  url.pathname = '/api/cpx/postback';

  const method = src.method.toUpperCase();
  const body = method === 'GET' || method === 'HEAD' ? undefined : src.body;

  const req = new Request(url.toString(), {
    method: method,
    headers: src.headers,
    body: body,
    redirect: 'manual'
  });

  return api({
    request: req,
    env: context.env,
    params: context.params,
    data: context.data,
    next: context.next,
    waitUntil: context.waitUntil,
    functionPath: context.functionPath
  });
}
