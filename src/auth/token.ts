import { sign, verify } from 'hono/jwt';
import { jwtSecret } from '../env.js';

const ACCESS_TTL = 60 * 60 * 24 * 30;
const STATE_TTL = 60 * 10;

type AccessPayload = {
  sub: string;
  loginId: string;
  exp: number;
  iat: number;
};

type OAuthStatePayload = {
  purpose: 'oauth';
  provider: string;
  userId?: string;
  exp: number;
  iat: number;
};

export async function signAccessToken(user: { id: string; loginId: string }) {
  const now = Math.floor(Date.now() / 1000);
  const payload: AccessPayload = {
    sub: user.id,
    loginId: user.loginId,
    iat: now,
    exp: now + ACCESS_TTL,
  };
  return sign(payload, jwtSecret(), 'HS256');
}

export async function verifyAccessToken(token: string) {
  const payload = (await verify(token, jwtSecret(), 'HS256')) as AccessPayload;
  if (!payload.sub || !payload.loginId) {
    throw new Error('invalid_token');
  }
  return payload;
}

export async function signOAuthState(provider: string, userId?: string) {
  const now = Math.floor(Date.now() / 1000);
  const payload: OAuthStatePayload = {
    purpose: 'oauth',
    provider,
    userId,
    iat: now,
    exp: now + STATE_TTL,
  };
  return sign(payload, jwtSecret(), 'HS256');
}

export async function verifyOAuthState(token: string) {
  const payload = (await verify(token, jwtSecret(), 'HS256')) as OAuthStatePayload;
  if (payload.purpose !== 'oauth' || !payload.provider) {
    throw new Error('invalid_state');
  }
  return payload;
}

export function bearerToken(header: string | undefined) {
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
  return token;
}
