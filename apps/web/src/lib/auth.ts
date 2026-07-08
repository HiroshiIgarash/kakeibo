export const AUTH_COOKIE_NAME = "kakeibo_auth";
export const AUTH_MAX_AGE_SECONDS = 60 * 60 * 24 * 365; // 1年

// base64url ヘルパ（Edge/Node 双方で使える標準API）
function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromBase64Url(s: string): Uint8Array<ArrayBuffer> {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4);
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function importKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

/** issuedAtMs を payload に持つトークン `${payloadB64}.${sigB64}` を生成する */
export async function signSession(issuedAtMs: number, secret: string): Promise<string> {
  const payload = String(issuedAtMs);
  const payloadBytes = new TextEncoder().encode(payload);
  const key = await importKey(secret);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, payloadBytes));
  return `${toBase64Url(payloadBytes)}.${toBase64Url(sig)}`;
}

/** 署名検証 + 有効期限チェック。不正な入力でも例外を投げず false を返す */
export async function verifySession(token: string, secret: string, now: number = Date.now()): Promise<boolean> {
  try {
    const [payloadB64, sigB64] = token.split(".");
    if (!payloadB64 || !sigB64) return false;
    const payloadBytes = fromBase64Url(payloadB64);
    const sig = fromBase64Url(sigB64);
    const key = await importKey(secret);
    // crypto.subtle.verify は定数時間比較
    const ok = await crypto.subtle.verify("HMAC", key, sig, payloadBytes);
    if (!ok) return false;
    const issuedAt = Number(new TextDecoder().decode(payloadBytes));
    if (!Number.isFinite(issuedAt)) return false;
    return now - issuedAt < AUTH_MAX_AGE_SECONDS * 1000;
  } catch {
    return false;
  }
}
