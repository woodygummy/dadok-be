import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export function loadDotEnv() {
  const path = resolve(process.cwd(), '.env');
  if (!existsSync(path)) return;

  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

export function requireEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing env: ${name}`);
  }
  return value;
}

export function jwtSecret() {
  return process.env.JWT_SECRET?.trim() || 'dev-only-change-me';
}

export function feOrigin() {
  return (process.env.FE_ORIGIN ?? 'http://127.0.0.1:43147').replace(/\/$/, '');
}

export function oauthRedirectBase() {
  return (process.env.OAUTH_REDIRECT_BASE ?? `http://localhost:${process.env.PORT ?? 8787}`).replace(
    /\/$/,
    ''
  );
}

export function isAdminLoginId(loginId: string) {
  const raw = process.env.ADMIN_LOGIN_ID?.trim() || 'woody';
  const allowed = raw
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(loginId.trim().toLowerCase());
}
