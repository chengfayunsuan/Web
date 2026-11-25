/**
 * 短回调入口：/pb  →  /api/cpx/postback
 *
 * 存在的理由只有一个：CPX 后台那个 Main Postback URL 字段一直判
 * "Your Postback URL is wrong!"，而 /api/cpx/postback 这条路径连同
 * 六个参数一共 161 个字符。老后台的字段有可能是定长或对路径层数敏感，
 * 所以给一条更短、更干净的路走一遍，把这个变量排除掉。
 *
 * _redirects 的改写进不了 Functions，必须用真实的函数文件。
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
