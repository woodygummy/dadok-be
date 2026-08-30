import { Hono } from 'hono';
import type { Provider } from '../db.js';
import {
  createUser,
  findOAuth,
  findUserByEmail,
  findUserById,
  findUserByLoginId,
  findUserByLoginOrEmail,
  linkOAuth,
  oauthProvidersForUser,
  uniqueLoginId,
} from '../db.js';
import { feOrigin } from '../env.js';
import { hashPassword, verifyPassword } from './password.js';
import { authorizeUrl, getProviderConfig, loadOAuthProfile, syntheticEmail } from './oauth.js';
import {
  bearerToken,
  signAccessToken,
  signOAuthState,
  verifyAccessToken,
  verifyOAuthState,
} from './token.js';
import { validateEmail, validateLoginId, validatePassword } from './validate.js';

const PROVIDERS: Provider[] = ['kakao', 'google', 'naver'];

function isProvider(value: string): value is Provider {
  return PROVIDERS.includes(value as Provider);
}

function publicUser(user: {
  id: string;
  loginId: string;
  email: string;
  nickname: string;
  passwordHash: string | null;
}) {
  return {
    id: user.id,
    loginId: user.loginId,
    email: user.email.endsWith('@oauth.dadok.local') ? '' : user.email,
    nickname: user.nickname,
    providers: oauthProvidersForUser(user.id),
    hasPassword: Boolean(user.passwordHash),
  };
}

function feRedirect(query: Record<string, string>) {
  const url = new URL('/auth/callback', feOrigin());
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

export const authRoutes = new Hono();

authRoutes.post('/register', async (c) => {
  const body = (await c.req.json().catch(() => null)) as {
    loginId?: string;
    password?: string;
    email?: string;
  } | null;

  const loginId = body?.loginId?.trim() ?? '';
  const password = body?.password ?? '';
  const email = body?.email?.trim().toLowerCase() ?? '';

  const loginError = validateLoginId(loginId);
  if (loginError) return c.json({ error: loginError }, 400);
  const emailError = validateEmail(email);
  if (emailError) return c.json({ error: emailError }, 400);
  const passwordError = validatePassword(password);
  if (passwordError) return c.json({ error: passwordError }, 400);

  if (findUserByLoginId(loginId)) {
    return c.json({ error: '이미 사용 중인 아이디입니다.' }, 409);
  }
  if (findUserByEmail(email)) {
    return c.json({ error: '이미 사용 중인 이메일입니다.' }, 409);
  }

  const user = createUser({
    loginId,
    email,
    passwordHash: hashPassword(password),
    nickname: loginId,
  });
  const token = await signAccessToken(user);
  return c.json({ token, user: publicUser(user) }, 201);
});

authRoutes.post('/login', async (c) => {
  const body = (await c.req.json().catch(() => null)) as {
    loginId?: string;
    password?: string;
  } | null;

  const loginId = body?.loginId?.trim() ?? '';
  const password = body?.password ?? '';
  if (!loginId || !password) {
    return c.json({ error: '아이디와 비밀번호를 입력해 주세요.' }, 400);
  }

  const user = findUserByLoginOrEmail(loginId);
  if (!user?.passwordHash) {
    return c.json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' }, 401);
  }
  if (!verifyPassword(password, user.passwordHash)) {
    return c.json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' }, 401);
  }

  const token = await signAccessToken(user);
  return c.json({ token, user: publicUser(user) });
});

authRoutes.get('/me', async (c) => {
  const token = bearerToken(c.req.header('Authorization'));
  if (!token) return c.json({ error: 'unauthorized' }, 401);
  try {
    const payload = await verifyAccessToken(token);
    const user = findUserById(payload.sub);
    if (!user) return c.json({ error: 'unauthorized' }, 401);
    return c.json({ user: publicUser(user) });
  } catch {
    return c.json({ error: 'unauthorized' }, 401);
  }
});

authRoutes.get('/:provider/start', async (c) => {
  const provider = c.req.param('provider');
  if (!isProvider(provider)) return c.json({ error: 'unknown_provider' }, 404);
  if (!getProviderConfig(provider)) {
    return c.redirect(feRedirect({ error: "oauth_not_configured" }));
  }

  let userId: string | undefined;
  const linkToken = c.req.query('token')?.trim();
  if (linkToken) {
    try {
      const payload = await verifyAccessToken(linkToken);
      userId = payload.sub;
    } catch {
      return c.redirect(feRedirect({ error: 'unauthorized' }));
    }
  }

  const state = await signOAuthState(provider, userId);
  const url = authorizeUrl(provider, state);
  if (!url) return c.json({ error: `${provider}_not_configured` }, 503);
  return c.redirect(url);
});

authRoutes.get('/:provider/callback', async (c) => {
  const provider = c.req.param('provider');
  if (!isProvider(provider)) return c.redirect(feRedirect({ error: 'unknown_provider' }));

  const error = c.req.query('error');
  if (error) return c.redirect(feRedirect({ error: 'oauth_denied' }));

  const code = c.req.query('code');
  const state = c.req.query('state');
  if (!code || !state) return c.redirect(feRedirect({ error: 'oauth_failed' }));

  try {
    const statePayload = await verifyOAuthState(state);
    if (statePayload.provider !== provider) {
      return c.redirect(feRedirect({ error: 'oauth_failed' }));
    }

    const profile = await loadOAuthProfile(provider, code, state);
    const existingOauth = findOAuth(provider, profile.providerUserId);

    if (statePayload.userId) {
      const current = findUserById(statePayload.userId);
      if (!current) return c.redirect(feRedirect({ error: 'unauthorized' }));
      if (existingOauth && existingOauth.userId !== current.id) {
        return c.redirect(feRedirect({ error: 'already_linked' }));
      }
      if (!existingOauth) {
        linkOAuth(current.id, provider, profile.providerUserId);
      }
      const token = await signAccessToken(current);
      return c.redirect(feRedirect({ token }));
    }

    if (existingOauth) {
      const user = findUserById(existingOauth.userId);
      if (!user) return c.redirect(feRedirect({ error: 'oauth_failed' }));
      const token = await signAccessToken(user);
      return c.redirect(feRedirect({ token }));
    }

    const email = profile.email?.toLowerCase() || syntheticEmail(provider, profile.providerUserId);
    const emailOwner = profile.email ? findUserByEmail(email) : null;
    const user =
      emailOwner ??
      createUser({
        loginId: uniqueLoginId(profile.email?.split('@')[0] || profile.nickname || provider),
        email,
        passwordHash: null,
        nickname: profile.nickname || uniqueLoginId(provider),
      });
    linkOAuth(user.id, provider, profile.providerUserId);
    const token = await signAccessToken(user);
    return c.redirect(feRedirect({ token }));
  } catch {
    return c.redirect(feRedirect({ error: 'oauth_failed' }));
  }
});
