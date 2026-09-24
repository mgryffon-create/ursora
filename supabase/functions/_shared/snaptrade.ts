type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

function env(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

function canonicalize(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    const out: Record<string, JsonValue> = {};
    for (const key of Object.keys(value).sort()) out[key] = canonicalize((value as Record<string, JsonValue>)[key]);
    return out;
  }
  return value;
}

function canonicalJson(value: JsonValue): string {
  return JSON.stringify(canonicalize(value));
}

async function hmacSha256Base64(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  const bytes = new Uint8Array(signature);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export interface SnapTradeRequestOptions {
  method?: 'GET' | 'POST' | 'DELETE';
  path: string;
  query?: Array<[string, string | number | boolean | null | undefined]>;
  body?: JsonValue;
  userId?: string | null;
  userSecret?: string | null;
}

export async function snapTradeRequest<T = unknown>(options: SnapTradeRequestOptions): Promise<T> {
  const clientId = env('SNAPTRADE_CLIENT_ID');
  const consumerKey = env('SNAPTRADE_CONSUMER_KEY');
  const timestamp = Math.floor(Date.now() / 1000).toString();

  const params = new URLSearchParams();
  params.append('clientId', clientId);
  params.append('timestamp', timestamp);
  if (options.userId) params.append('userId', options.userId);
  if (options.userSecret) params.append('userSecret', options.userSecret);
  for (const [key, value] of options.query ?? []) {
    if (value !== null && value !== undefined && value !== '') params.append(key, String(value));
  }

  const query = params.toString();
  const content = options.body === undefined ? null : options.body;
  const payload = canonicalJson({
    content,
    path: options.path,
    query,
  } as JsonValue);
  const signature = await hmacSha256Base64(consumerKey, payload);

  const response = await fetch(`https://api.snaptrade.com${options.path}?${query}`, {
    method: options.method ?? 'GET',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Signature: signature,
    },
    body: content === null ? undefined : JSON.stringify(content),
  });

  const raw = await response.text();
  let parsed: unknown = null;
  try { parsed = raw ? JSON.parse(raw) : null; } catch { parsed = raw; }

  if (!response.ok) {
    const detail =
      typeof parsed === 'string'
        ? parsed
        : parsed && typeof parsed === 'object'
          ? JSON.stringify(parsed)
          : raw;
    throw new Error(`SnapTrade HTTP ${response.status}: ${detail.slice(0, 700)}`);
  }

  return parsed as T;
}
