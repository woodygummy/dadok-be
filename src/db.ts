import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

export type Provider = 'kakao' | 'google' | 'naver';

export type UserRecord = {
  id: string;
  loginId: string;
  email: string;
  passwordHash: string | null;
  nickname: string;
  createdAt: string;
};

export type OAuthRecord = {
  id: string;
  userId: string;
  provider: Provider;
  providerUserId: string;
};

type DbFile = {
  users: UserRecord[];
  oauthAccounts: OAuthRecord[];
};

const DB_PATH = resolve(process.cwd(), 'data', 'dadok.json');

function emptyDb(): DbFile {
  return { users: [], oauthAccounts: [] };
}

function readDb(): DbFile {
  if (!existsSync(DB_PATH)) return emptyDb();
  try {
    const parsed = JSON.parse(readFileSync(DB_PATH, 'utf8')) as Partial<DbFile>;
    return {
      users: Array.isArray(parsed.users) ? parsed.users : [],
      oauthAccounts: Array.isArray(parsed.oauthAccounts) ? parsed.oauthAccounts : [],
    };
  } catch {
    return emptyDb();
  }
}

function writeDb(db: DbFile) {
  mkdirSync(dirname(DB_PATH), { recursive: true });
  writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf8');
}

function save(mutator: (db: DbFile) => void): DbFile {
  const db = readDb();
  mutator(db);
  writeDb(db);
  return db;
}

export function findUserById(id: string) {
  return readDb().users.find((user) => user.id === id) ?? null;
}

export function findUserByLoginId(loginId: string) {
  const needle = loginId.trim().toLowerCase();
  return readDb().users.find((user) => user.loginId.toLowerCase() === needle) ?? null;
}

export function findUserByEmail(email: string) {
  const needle = email.trim().toLowerCase();
  return readDb().users.find((user) => user.email.toLowerCase() === needle) ?? null;
}

export function findUserByLoginOrEmail(identifier: string) {
  return findUserByLoginId(identifier) ?? findUserByEmail(identifier);
}

export function findOAuth(provider: Provider, providerUserId: string) {
  return (
    readDb().oauthAccounts.find(
      (account) => account.provider === provider && account.providerUserId === providerUserId
    ) ?? null
  );
}

export function oauthProvidersForUser(userId: string): Provider[] {
  return readDb()
    .oauthAccounts.filter((account) => account.userId === userId)
    .map((account) => account.provider);
}

export function createUser(input: {
  loginId: string;
  email: string;
  passwordHash: string | null;
  nickname: string;
}): UserRecord {
  const user: UserRecord = {
    id: randomUUID(),
    loginId: input.loginId,
    email: input.email.trim().toLowerCase(),
    passwordHash: input.passwordHash,
    nickname: input.nickname.trim() || input.loginId,
    createdAt: new Date().toISOString(),
  };
  save((db) => {
    db.users.push(user);
  });
  return user;
}

export function linkOAuth(userId: string, provider: Provider, providerUserId: string) {
  const existing = findOAuth(provider, providerUserId);
  if (existing) return existing;
  const account: OAuthRecord = {
    id: randomUUID(),
    userId,
    provider,
    providerUserId,
  };
  save((db) => {
    db.oauthAccounts.push(account);
  });
  return account;
}

export function uniqueLoginId(base: string) {
  const cleaned = base.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 16) || 'user';
  let candidate = cleaned.length >= 4 ? cleaned : `${cleaned}1234`.slice(0, 20);
  let n = 1;
  while (findUserByLoginId(candidate)) {
    const suffix = String(n++);
    candidate = `${cleaned.slice(0, 20 - suffix.length)}${suffix}`;
  }
  return candidate;
}
