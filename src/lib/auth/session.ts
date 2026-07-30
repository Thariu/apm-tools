import { SESSION_MAX_AGE_SEC } from "./constants";
import { getAuthCredentials } from "./config";

type SessionPayload = {
  exp: number;
};

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const padLen = (4 - (padded.length % 4)) % 4;
  const base64 = padded + "=".repeat(padLen);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

async function signPayload(payload: string, secret: string): Promise<string> {
  const key = await importHmacKey(secret);
  const encoder = new TextEncoder();
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(payload),
  );
  return base64UrlEncode(new Uint8Array(signature));
}

export async function createSessionToken(): Promise<string | null> {
  const creds = getAuthCredentials();
  if (!creds) {
    return null;
  }

  const payload: SessionPayload = {
    exp: Date.now() + SESSION_MAX_AGE_SEC * 1000,
  };
  const payloadJson = JSON.stringify(payload);
  const payloadPart = base64UrlEncode(new TextEncoder().encode(payloadJson));
  const signature = await signPayload(payloadPart, creds.sessionSecret);
  return `${payloadPart}.${signature}`;
}

export async function isValidSessionToken(token: string | undefined): Promise<boolean> {
  if (!token) {
    return false;
  }

  const creds = getAuthCredentials();
  if (!creds) {
    return false;
  }

  const dot = token.lastIndexOf(".");
  if (dot <= 0) {
    return false;
  }

  const payloadPart = token.slice(0, dot);
  const signaturePart = token.slice(dot + 1);

  const expectedSignature = await signPayload(payloadPart, creds.sessionSecret);
  if (!safeEqual(signaturePart, expectedSignature)) {
    return false;
  }

  try {
    const json = new TextDecoder().decode(base64UrlDecode(payloadPart));
    const payload = JSON.parse(json) as SessionPayload;
    if (typeof payload.exp !== "number" || Date.now() > payload.exp) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
