/* PostgREST PGRST303: the JWT's `iat` is a few seconds in the future
 * relative to the node that validates it. On hosted Supabase the gateway
 * mints a short-lived JWT from the publishable/secret key; if that node's
 * clock is ahead of PostgREST, the first REST call 401s and the identical
 * retry succeeds. Same shape as a wifi blip: wait a beat and try again.
 *
 * https://github.com/supabase/supabase/issues/49655
 */

export const JWT_FUTURE_RETRY_MS = 300;
export const JWT_FUTURE_RETRIES = 2;

export const isJwtIssuedAtFuture = (status: number, body: string): boolean =>
  status === 401 && /PGRST303|JWT issued at future/i.test(body);

export const fetchWithJwtSkewRetry = async (
  input: RequestInfo | URL,
  init?: RequestInit,
  deps: {
    fetch?: typeof fetch;
    wait?: (ms: number) => Promise<void>;
  } = {},
): Promise<Response> => {
  const doFetch = deps.fetch ?? globalThis.fetch;
  const wait =
    deps.wait ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));

  let last = await doFetch(input, init);
  for (let i = 0; i < JWT_FUTURE_RETRIES && last.status === 401; i++) {
    let body = "";
    try {
      body = await last.clone().text();
    } catch {
      return last;
    }
    if (!isJwtIssuedAtFuture(last.status, body)) return last;
    await wait(JWT_FUTURE_RETRY_MS);
    last = await doFetch(input, init);
  }
  return last;
};
