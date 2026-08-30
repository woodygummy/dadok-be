import { oauthRedirectBase } from '../env.js';
import type { Provider } from '../db.js';

export type OAuthProfile = {
  provider: Provider;
  providerUserId: string;
  email: string | null;
  nickname: string | null;
};

type ProviderConfig = {
  clientId: string;
  clientSecret: string;
  authorizeUrl: string;
  tokenUrl: string;
  extraAuthorize?: Record<string, string>;
};

export function redirectUri(provider: Provider) {
  return `${oauthRedirectBase()}/auth/${provider}/callback`;
}

export function getProviderConfig(provider: Provider): ProviderConfig | null {
  if (provider === 'google') {
    const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
    if (!clientId || !clientSecret) return null;
    return {
      clientId,
      clientSecret,
      authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      extraAuthorize: {
        scope: 'openid email profile',
        access_type: 'online',
        prompt: 'select_account',
      },
    };
  }
  if (provider === 'kakao') {
    const clientId = process.env.KAKAO_CLIENT_ID?.trim();
    const clientSecret = process.env.KAKAO_CLIENT_SECRET?.trim() ?? '';
    if (!clientId) return null;
    return {
      clientId,
      clientSecret,
      authorizeUrl: 'https://kauth.kakao.com/oauth/authorize',
      tokenUrl: 'https://kauth.kakao.com/oauth/token',
      extraAuthorize: { scope: 'profile_nickname,account_email' },
    };
  }
  const clientId = process.env.NAVER_CLIENT_ID?.trim();
  const clientSecret = process.env.NAVER_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  return {
    clientId,
    clientSecret,
    authorizeUrl: 'https://nid.naver.com/oauth2.0/authorize',
    tokenUrl: 'https://nid.naver.com/oauth2.0/token',
  };
}

export function authorizeUrl(provider: Provider, state: string) {
  const config = getProviderConfig(provider);
  if (!config) return null;
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: redirectUri(provider),
    response_type: 'code',
    state,
    ...config.extraAuthorize,
  });
  return `${config.authorizeUrl}?${params.toString()}`;
}

async function exchangeCode(provider: Provider, code: string, state: string) {
  const config = getProviderConfig(provider);
  if (!config) throw new Error('provider_not_configured');

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: config.clientId,
    redirect_uri: redirectUri(provider),
    code,
    state,
  });
  if (config.clientSecret) {
    body.set('client_secret', config.clientSecret);
  }

  const response = await fetch(config.tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body,
  });
  if (!response.ok) {
    throw new Error('token_exchange_failed');
  }
  const data = (await response.json()) as { access_token?: string };
  if (!data.access_token) throw new Error('token_exchange_failed');
  return data.access_token;
}

async function fetchGoogleProfile(accessToken: string): Promise<OAuthProfile> {
  const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error('profile_failed');
  const data = (await response.json()) as {
    id?: string;
    email?: string;
    name?: string;
  };
  if (!data.id) throw new Error('profile_failed');
  return {
    provider: 'google',
    providerUserId: data.id,
    email: data.email?.trim() || null,
    nickname: data.name?.trim() || null,
  };
}

async function fetchKakaoProfile(accessToken: string): Promise<OAuthProfile> {
  const response = await fetch('https://kapi.kakao.com/v2/user/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error('profile_failed');
  const data = (await response.json()) as {
    id?: number | string;
    kakao_account?: {
      email?: string;
      profile?: { nickname?: string };
    };
  };
  if (data.id == null) throw new Error('profile_failed');
  return {
    provider: 'kakao',
    providerUserId: String(data.id),
    email: data.kakao_account?.email?.trim() || null,
    nickname: data.kakao_account?.profile?.nickname?.trim() || null,
  };
}

async function fetchNaverProfile(accessToken: string): Promise<OAuthProfile> {
  const response = await fetch('https://openapi.naver.com/v1/nid/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error('profile_failed');
  const data = (await response.json()) as {
    response?: { id?: string; email?: string; nickname?: string; name?: string };
  };
  const profile = data.response;
  if (!profile?.id) throw new Error('profile_failed');
  return {
    provider: 'naver',
    providerUserId: profile.id,
    email: profile.email?.trim() || null,
    nickname: profile.nickname?.trim() || profile.name?.trim() || null,
  };
}

export async function loadOAuthProfile(provider: Provider, code: string, state: string) {
  const accessToken = await exchangeCode(provider, code, state);
  if (provider === 'google') return fetchGoogleProfile(accessToken);
  if (provider === 'kakao') return fetchKakaoProfile(accessToken);
  return fetchNaverProfile(accessToken);
}

export function syntheticEmail(provider: Provider, providerUserId: string) {
  return `${provider}_${providerUserId}@oauth.dadok.local`;
}
