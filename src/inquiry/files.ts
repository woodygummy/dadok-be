import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { InquiryAttachment } from '../db.js';

const FILE_DIR = resolve(process.cwd(), 'data', 'inquiry-files');
const MAX_FILES = 3;
const MAX_BYTES = 1_500_000;
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

export type IncomingImage = {
  mime?: string;
  name?: string;
  data?: string;
};

function filePath(id: string) {
  return resolve(FILE_DIR, id);
}

export function decodeImages(input: IncomingImage[] | undefined): InquiryAttachment[] | string {
  const items = Array.isArray(input) ? input.slice(0, MAX_FILES) : [];
  const saved: InquiryAttachment[] = [];
  mkdirSync(FILE_DIR, { recursive: true });

  for (const item of items) {
    const mime = item.mime?.trim().toLowerCase() ?? '';
    if (!ALLOWED.has(mime)) return '이미지는 jpg, png, webp, gif만 올릴 수 있습니다.';
    const raw = (item.data ?? '').replace(/^data:[^;]+;base64,/, '');
    let buffer: Buffer;
    try {
      buffer = Buffer.from(raw, 'base64');
    } catch {
      return '이미지 파일을 읽지 못했습니다.';
    }
    if (!buffer.length) continue;
    if (buffer.length > MAX_BYTES) return '이미지는 장당 1.5MB 이하로 올려 주세요.';
    const id = randomUUID();
    writeFileSync(filePath(id), buffer);
    saved.push({
      id,
      mime,
      name: (item.name?.trim() || 'image').slice(0, 80),
    });
  }

  return saved;
}

export function readInquiryFile(id: string) {
  const path = filePath(id);
  if (!existsSync(path)) return null;
  return readFileSync(path);
}
