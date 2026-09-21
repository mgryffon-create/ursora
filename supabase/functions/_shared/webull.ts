import md5 from 'npm:blueimp-md5@2.19.0';

export type WebullEnvironment = 'sandbox' | 'production';

export interface WebullConfig {
  appKey: string;
  appSecret: string;
  host: string;
  environment: WebullEnvironment;
}

export class WebullApiError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = 'WebullApiError';
    this.status = status;
    this.body = body;
  }
}

export function webullConfig(): WebullConfig {
  const appKey = Deno.env.get('WEBULL_APP_KEY')?.trim();
  const appSecret = Deno.env.get('WEBULL_APP_SECRET')?.trim();
  if (!appKey || !appSecret) {
    throw new Error('WEBULL_APP_KEY and WEBULL_APP_SECRET must be configured as Supabase Edge Function secrets.');
  }
  const environment = (Deno.env.get('WEBULL_ENVIRONMENT')?.trim().toLowerCase() === 'production')
    ? 'production'
    : 'sandbox';
  const host = environment === 'production' ? 'api.webull.com' : 'api.sandbox.webull.com';
  return { appKey, appSecret, host, environment };
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function encodeWebull(value: string): string {
  // Webull's examples use standard URL encoding for the final canonical string.
  // encodeURIComponent is RFC 3986-compatible for the characters Webull signs.
  return encodeURIComponent(value);
}

function canonicalQuery(params: Record<string, string | number | boolean | null | undefined>): URLSearchParams {
  const result = new URLSearchParams();
  Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null)
    .sort(([a], [b]) => a.localeCompare(b))
    .forEach(([k, v]) => result.append(k, String(v)));
  return result;
}

async function hmacSha1Base64(secret: string, value: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(`${secret}&`),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, enc.encode(value));
  return bytesToBase64(new Uint8Array(signature));
}

export async function webullGet<T = unknown>(
  path: string,
  query: Record<string, string | number | boolean | null | undefined> = {},
): Promise<T> {
  const config = webullConfig();
  const timestamp = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const nonce = crypto.randomUUID().replaceAll('-', '');
  const queryParams = canonicalQuery(query);

  const signingPairs: Array<[string, string]> = [
    ...Array.from(queryParams.entries()),
    ['host', config.host],
    ['x-app-key', config.appKey],
    ['x-signature-algorithm', 'HMAC-SHA1'],
    ['x-signature-nonce', nonce],
    ['x-signature-version', '1.0'],
    ['x-timestamp', timestamp],
  ].sort(([a], [b]) => a.localeCompare(b));

  const str1 = signingPairs.map(([k, v]) => `${k}=${v}`).join('&');
  const signingString = encodeWebull(`${path}&${str1}`);
  const signature = await hmacSha1Base64(config.appSecret, signingString);

  const url = new URL(`https://${config.host}${path}`);
  for (const [k, v] of queryParams.entries()) url.searchParams.append(k, v);

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'x-app-key': config.appKey,
      'x-timestamp': timestamp,
      'x-signature-algorithm': 'HMAC-SHA1',
      'x-signature-version': '1.0',
      'x-signature-nonce': nonce,
      'x-version': 'v3',
      'x-signature': signature,
      'Accept': 'application/json',
    },
  });

  const raw = await response.text();
  let body: unknown = raw;
  try { body = raw ? JSON.parse(raw) : null; } catch { /* keep text */ }
  if (!response.ok) {
    throw new WebullApiError(`Webull returned HTTP ${response.status}.`, response.status, body);
  }
  return body as T;
}

export async function webullPost<T = unknown>(
  path: string,
  body: Record<string, unknown>,
  query: Record<string, string | number | boolean | null | undefined> = {},
): Promise<T> {
  const config = webullConfig();
  const timestamp = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const nonce = crypto.randomUUID().replaceAll('-', '');
  const queryParams = canonicalQuery(query);
  const bodyString = JSON.stringify(body);

  const signingPairs: Array<[string, string]> = [
    ...Array.from(queryParams.entries()),
    ['host', config.host],
    ['x-app-key', config.appKey],
    ['x-signature-algorithm', 'HMAC-SHA1'],
    ['x-signature-nonce', nonce],
    ['x-signature-version', '1.0'],
    ['x-timestamp', timestamp],
  ].sort(([a], [b]) => a.localeCompare(b));

  const str1 = signingPairs.map(([k, v]) => `${k}=${v}`).join('&');
  const bodyHash = String(md5(bodyString)).toUpperCase();
  const signingString = encodeWebull(`${path}&${str1}&${bodyHash}`);
  const signature = await hmacSha1Base64(config.appSecret, signingString);

  const url = new URL(`https://${config.host}${path}`);
  for (const [k, v] of queryParams.entries()) url.searchParams.append(k, v);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'x-app-key': config.appKey,
      'x-timestamp': timestamp,
      'x-signature-algorithm': 'HMAC-SHA1',
      'x-signature-version': '1.0',
      'x-signature-nonce': nonce,
      'x-version': 'v3',
      'x-signature': signature,
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    },
    body: bodyString,
  });

  const raw = await response.text();
  let parsed: unknown = raw;
  try { parsed = raw ? JSON.parse(raw) : null; } catch { /* keep text */ }
  if (!response.ok) {
    throw new WebullApiError(`Webull returned HTTP ${response.status}.`, response.status, parsed);
  }
  return parsed as T;
}

export function summarizeWebullError(error: unknown) {
  if (error instanceof WebullApiError) {
    return { message: error.message, status: error.status, provider_body: error.body };
  }
  return { message: error instanceof Error ? error.message : String(error) };
}
