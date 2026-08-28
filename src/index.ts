import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';

type Book = {
  id: string;
  title: string;
  authors: string;
  thumbnail: string | null;
  addedAt: string;
};

type AladinItem = {
  itemId?: number | string;
  isbn?: string;
  isbn13?: string;
  title?: string;
  author?: string;
  cover?: string;
};

type AladinResponse = {
  item?: AladinItem[];
};

const app = new Hono();

app.use(
  '*',
  cors({
    origin: '*',
  })
);

app.get('/health', (c) => c.json({ ok: true }));

function parseAladinJson(text: string): AladinResponse {
  const trimmed = text.trim();
  const jsonText = trimmed.startsWith('{')
    ? trimmed
    : trimmed.slice(trimmed.indexOf('{'), trimmed.lastIndexOf('}') + 1);
  return JSON.parse(jsonText) as AladinResponse;
}

function mapItems(items: AladinItem[]): Book[] {
  return items.map((item, index) => {
    const id =
      item.isbn13 ||
      item.isbn ||
      (item.itemId != null ? String(item.itemId) : `aladin-${index}`);
    const thumbnail = item.cover
      ? item.cover.replace('http://', 'https://')
      : null;
    return {
      id,
      title: item.title?.trim() || '제목 없음',
      authors: item.author?.trim() || '저자 미상',
      thumbnail,
      addedAt: '',
    };
  });
}

async function searchAladin(q: string): Promise<Book[] | null> {
  const ttbkey = process.env.ALADIN_TTB_KEY?.trim();
  if (!ttbkey) return null;

  const params = new URLSearchParams({
    ttbkey,
    Query: q,
    QueryType: 'Keyword',
    MaxResults: '20',
    start: '1',
    SearchTarget: 'Book',
    output: 'js',
    Version: '20131101',
    Cover: 'MidBig',
  });

  const response = await fetch(
    `https://www.aladin.co.kr/ttb/api/ItemSearch.aspx?${params.toString()}`
  );
  if (!response.ok) return null;

  const books = mapItems(parseAladinJson(await response.text()).item ?? []);
  return books;
}

app.get('/books', async (c) => {
  const q = c.req.query('q')?.trim();
  if (!q) {
    return c.json({ books: [] });
  }

  const books = await searchAladin(q);
  if (!books) {
    return c.json({ books: [], error: 'aladin_unavailable' }, 502);
  }

  return c.json({ books, source: 'aladin' });
});

const port = Number(process.env.PORT ?? 8787);

serve({
  fetch: app.fetch,
  port,
});

console.log(`dadok-be listening on http://localhost:${port}`);
