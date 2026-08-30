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

export type InquiryRole = 'user' | 'admin';

export type InquiryAttachment = {
  id: string;
  mime: string;
  name: string;
};

export type InquiryMessage = {
  id: string;
  role: InquiryRole;
  body: string;
  attachments: InquiryAttachment[];
  createdAt: string;
};

export type InquiryRecord = {
  id: string;
  userId: string;
  preview: string;
  adminUnread: boolean;
  userUnread: boolean;
  createdAt: string;
  updatedAt: string;
  messages: InquiryMessage[];
};

type DbFile = {
  users: UserRecord[];
  oauthAccounts: OAuthRecord[];
  inquiries: InquiryRecord[];
};

const DB_PATH = resolve(process.cwd(), 'data', 'dadok.json');

function emptyDb(): DbFile {
  return { users: [], oauthAccounts: [], inquiries: [] };
}

function readDb(): DbFile {
  if (!existsSync(DB_PATH)) return emptyDb();
  try {
    const parsed = JSON.parse(readFileSync(DB_PATH, 'utf8')) as Partial<DbFile>;
    return {
      users: Array.isArray(parsed.users) ? parsed.users : [],
      oauthAccounts: Array.isArray(parsed.oauthAccounts) ? parsed.oauthAccounts : [],
      inquiries: Array.isArray(parsed.inquiries) ? parsed.inquiries : [],
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

function previewOf(body: string) {
  const text = body.replace(/\s+/g, ' ').trim();
  if (!text) return '이미지 첨부';
  return text.length > 40 ? `${text.slice(0, 40)}…` : text;
}

export function listInquiries(userId: string, admin: boolean) {
  const db = readDb();
  const rows = admin ? db.inquiries : db.inquiries.filter((row) => row.userId === userId);
  return [...rows].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function adminUnreadCount() {
  return readDb().inquiries.filter((row) => row.adminUnread).length;
}

export function userUnreadCount(userId: string) {
  return readDb().inquiries.filter((row) => row.userId === userId && row.userUnread).length;
}

export function findInquiry(id: string) {
  return readDb().inquiries.find((row) => row.id === id) ?? null;
}

export function createInquiry(input: {
  userId: string;
  body: string;
  attachments: InquiryAttachment[];
}): InquiryRecord {
  const now = new Date().toISOString();
  const inquiry: InquiryRecord = {
    id: randomUUID(),
    userId: input.userId,
    preview: previewOf(input.body),
    adminUnread: true,
    userUnread: false,
    createdAt: now,
    updatedAt: now,
    messages: [
      {
        id: randomUUID(),
        role: 'user',
        body: input.body,
        attachments: input.attachments,
        createdAt: now,
      },
    ],
  };
  save((db) => {
    db.inquiries.push(inquiry);
  });
  return inquiry;
}

export function addInquiryMessage(
  id: string,
  input: { role: InquiryRole; body: string; attachments: InquiryAttachment[] }
) {
  const now = new Date().toISOString();
  save((db) => {
    const inquiry = db.inquiries.find((row) => row.id === id);
    if (!inquiry) return;
    inquiry.messages.push({
      id: randomUUID(),
      role: input.role,
      body: input.body,
      attachments: input.attachments,
      createdAt: now,
    });
    inquiry.preview = previewOf(input.body);
    inquiry.updatedAt = now;
    inquiry.adminUnread = input.role === 'user';
    inquiry.userUnread = input.role === 'admin';
  });
  return findInquiry(id);
}

export function markInquiryRead(id: string, admin: boolean) {
  save((db) => {
    const inquiry = db.inquiries.find((row) => row.id === id);
    if (!inquiry) return;
    if (admin) inquiry.adminUnread = false;
    else inquiry.userUnread = false;
  });
}

export function findAttachment(fileId: string) {
  for (const inquiry of readDb().inquiries) {
    for (const message of inquiry.messages) {
      const attachment = message.attachments.find((item) => item.id === fileId);
      if (attachment) {
        return { inquiry, attachment };
      }
    }
  }
  return null;
}
