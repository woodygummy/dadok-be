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

type GoogleVolume = {
  id: string;
  volumeInfo?: {
    title?: string;
    authors?: string[];
    imageLinks?: {
      thumbnail?: string;
      smallThumbnail?: string;
    };
  };
};

type OpenLibraryDoc = {
  key?: string;
  title?: string;
  author_name?: string[];
  cover_i?: number;
};

const app = new Hono();

app.use(
  '*',
  cors({
    origin: '*',
  })
);

app.get('/health', (c) => c.json({ ok: true }));

async function searchGoogle(q: string): Promise<Book[] | null> {
  const params = new URLSearchParams({
    q,
    maxResults: '20',
    printType: 'books',
  });

  const key = process.env.GOOGLE_BOOKS_API_KEY;
  if (key) params.set('key', key);

  const response = await fetch(`https://www.googleapis.com/books/v1/volumes?${params.toString()}`);
  if (!response.ok) return null;

  const data = (await response.json()) as { items?: GoogleVolume[] };
  return (data.items ?? []).map((item) => {
    const info = item.volumeInfo ?? {};
    const thumbnail = info.imageLinks?.thumbnail ?? info.imageLinks?.smallThumbnail ?? null;
    return {
      id: item.id,
      title: info.title ?? '제목 없음',
      authors: info.authors?.join(', ') ?? '저자 미상',
      thumbnail: thumbnail ? thumbnail.replace('http://', 'https://') : null,
      addedAt: '',
    };
  });
}

async function searchOpenLibrary(q: string): Promise<Book[]> {
  const params = new URLSearchParams({ q, limit: '20' });
  const response = await fetch(`https://openlibrary.org/search.json?${params.toString()}`);
  if (!response.ok) return [];

  const data = (await response.json()) as { docs?: OpenLibraryDoc[] };
  return (data.docs ?? []).map((doc, index) => ({
    id: doc.key ?? `ol-${index}`,
    title: doc.title ?? '제목 없음',
    authors: doc.author_name?.join(', ') ?? '저자 미상',
    thumbnail: doc.cover_i
      ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg`
      : null,
    addedAt: '',
  }));
}

app.get('/books', async (c) => {
  const q = c.req.query('q')?.trim();
  if (!q) {
    return c.json({ books: [] });
  }

  const google = await searchGoogle(q);
  if (google && google.length > 0) {
    return c.json({ books: google, source: 'google' });
  }

  const fallback = await searchOpenLibrary(q);
  return c.json({ books: fallback, source: 'openlibrary' });
});

const port = Number(process.env.PORT ?? 8787);

serve({
  fetch: app.fetch,
  port,
});

console.log(`dadok-be listening on http://localhost:${port}`);
