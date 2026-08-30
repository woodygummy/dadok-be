import { Hono } from 'hono';
import {
  addInquiryMessage,
  adminUnreadCount,
  userUnreadCount,
  createInquiry,
  findInquiry,
  findAttachment,
  findUserById,
  listInquiries,
  markInquiryRead,
  type InquiryRecord,
} from '../db.js';
import { isAdminLoginId } from '../env.js';
import { bearerToken, verifyAccessToken } from '../auth/token.js';
import { decodeImages, readInquiryFile } from './files.js';

const MAX_BODY = 4000;

async function currentUser(c: { req: { header: (name: string) => string | undefined } }) {
  const token = bearerToken(c.req.header('Authorization'));
  if (!token) return null;
  try {
    const payload = await verifyAccessToken(token);
    const user = findUserById(payload.sub);
    if (!user) return null;
    return { ...user, isAdmin: isAdminLoginId(user.loginId) };
  } catch {
    return null;
  }
}

function previewBody(body: unknown) {
  return typeof body === 'string' ? body.trim().slice(0, MAX_BODY) : '';
}

function clip(text: string) {
  const value = text.replace(/\s+/g, ' ').trim();
  if (!value) return '';
  return value.length > 36 ? `${value.slice(0, 36)}…` : value;
}

function summary(inquiry: InquiryRecord, admin: boolean) {
  const owner = findUserById(inquiry.userId);
  const question = [...inquiry.messages].find((message) => message.role === 'user');
  const reply = [...inquiry.messages].reverse().find((message) => message.role === 'admin');
  return {
    id: inquiry.id,
    preview: inquiry.preview,
    question: clip(question?.body ?? '') || (question?.attachments.length ? '파일 첨부' : ''),
    reply: clip(reply?.body ?? '') || (reply?.attachments.length ? '파일 첨부' : ''),
    hasReply: Boolean(reply),
    updatedAt: inquiry.updatedAt,
    unread: admin ? inquiry.adminUnread : inquiry.userUnread,
    fromLoginId: owner?.loginId ?? '',
    fromNickname: owner?.nickname ?? '',
  };
}

function detail(inquiry: InquiryRecord) {
  const owner = findUserById(inquiry.userId);
  return {
    id: inquiry.id,
    fromLoginId: owner?.loginId ?? '',
    fromNickname: owner?.nickname ?? '',
    updatedAt: inquiry.updatedAt,
    messages: inquiry.messages.map((message) => ({
      id: message.id,
      role: message.role,
      body: message.body,
      createdAt: message.createdAt,
      attachments: message.attachments.map((file) => ({
        id: file.id,
        mime: file.mime,
        name: file.name,
      })),
    })),
  };
}

export const inquiryRoutes = new Hono();

inquiryRoutes.get('/', async (c) => {
  const user = await currentUser(c);
  if (!user) return c.json({ error: 'unauthorized' }, 401);
  return c.json({
    inquiries: listInquiries(user.id, user.isAdmin).map((row) => summary(row, user.isAdmin)),
  });
});

inquiryRoutes.get('/unread', async (c) => {
  const user = await currentUser(c);
  if (!user) return c.json({ error: 'unauthorized' }, 401);
  if (!user.isAdmin) return c.json({ count: userUnreadCount(user.id) });
  return c.json({ count: adminUnreadCount() });
});

inquiryRoutes.post('/', async (c) => {
  const user = await currentUser(c);
  if (!user) return c.json({ error: 'unauthorized' }, 401);
  if (user.isAdmin) {
    return c.json({ error: '관리자 계정에서는 문의를 보내지 않습니다.' }, 400);
  }

  const payload = (await c.req.json().catch(() => null)) as {
    body?: string;
    images?: { mime?: string; name?: string; data?: string }[];
  } | null;
  const body = previewBody(payload?.body);
  const images = decodeImages(payload?.images);
  if (typeof images === 'string') return c.json({ error: images }, 400);
  if (!body && images.length === 0) {
    return c.json({ error: '문의 내용을 적어 주세요.' }, 400);
  }

  const inquiry = createInquiry({ userId: user.id, body, attachments: images });
  return c.json({ inquiry: detail(inquiry) }, 201);
});

inquiryRoutes.get('/:id/files/:fileId', async (c) => {
  const user = await currentUser(c);
  if (!user) return c.json({ error: 'unauthorized' }, 401);
  const found = findAttachment(c.req.param('fileId'));
  if (!found) return c.json({ error: 'not_found' }, 404);
  if (!user.isAdmin && found.inquiry.userId !== user.id) {
    return c.json({ error: 'forbidden' }, 403);
  }
  const bytes = readInquiryFile(found.attachment.id);
  if (!bytes) return c.json({ error: 'not_found' }, 404);
  return c.body(bytes, 200, {
    'Content-Type': found.attachment.mime,
    'Cache-Control': 'private, max-age=86400',
  });
});

inquiryRoutes.get('/:id', async (c) => {
  const user = await currentUser(c);
  if (!user) return c.json({ error: 'unauthorized' }, 401);
  const inquiry = findInquiry(c.req.param('id'));
  if (!inquiry) return c.json({ error: 'not_found' }, 404);
  if (!user.isAdmin && inquiry.userId !== user.id) {
    return c.json({ error: 'forbidden' }, 403);
  }
  markInquiryRead(inquiry.id, user.isAdmin);
  const fresh = findInquiry(inquiry.id) ?? inquiry;
  return c.json({ inquiry: detail(fresh) });
});

inquiryRoutes.post('/:id/replies', async (c) => {
  const user = await currentUser(c);
  if (!user) return c.json({ error: 'unauthorized' }, 401);
  if (!user.isAdmin) return c.json({ error: '답변은 관리자만 보낼 수 있습니다.' }, 403);
  const inquiry = findInquiry(c.req.param('id'));
  if (!inquiry) return c.json({ error: 'not_found' }, 404);
  if (inquiry.messages.some((message) => message.role === 'admin')) {
    return c.json({ error: '이미 답변한 문의입니다.' }, 400);
  }

  const payload = (await c.req.json().catch(() => null)) as {
    body?: string;
    images?: { mime?: string; name?: string; data?: string }[];
  } | null;
  const body = previewBody(payload?.body);
  const images = decodeImages(payload?.images);
  if (typeof images === 'string') return c.json({ error: images }, 400);
  if (!body && images.length === 0) {
    return c.json({ error: '내용을 적어 주세요.' }, 400);
  }

  const updated = addInquiryMessage(inquiry.id, {
    role: 'admin',
    body,
    attachments: images,
  });
  if (!updated) return c.json({ error: 'not_found' }, 404);
  return c.json({ inquiry: detail(updated) });
});
