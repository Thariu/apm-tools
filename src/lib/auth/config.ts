export function isAuthConfigured(): boolean {
  return Boolean(
    process.env.AUTH_USERNAME?.trim() &&
      process.env.AUTH_PASSWORD?.trim() &&
      process.env.AUTH_SESSION_SECRET?.trim(),
  );
}

export function getAuthCredentials(): {
  username: string;
  password: string;
  sessionSecret: string;
} | null {
  const username = process.env.AUTH_USERNAME?.trim();
  const password = process.env.AUTH_PASSWORD?.trim();
  const sessionSecret = process.env.AUTH_SESSION_SECRET?.trim();
  if (!username || !password || !sessionSecret) {
    return null;
  }
  return { username, password, sessionSecret };
}
