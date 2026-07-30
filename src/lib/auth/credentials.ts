import { getAuthCredentials } from "./config";

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

export function verifyCredentials(
  username: string,
  password: string,
): boolean {
  const creds = getAuthCredentials();
  if (!creds) {
    return false;
  }
  return (
    safeEqual(username, creds.username) && safeEqual(password, creds.password)
  );
}
