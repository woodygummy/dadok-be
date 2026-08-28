-- Supabase에 붙일 때 사용할 최소 스키마. 지금은 앱이 로컬 저장을 씀.

create table if not exists public.bookshelves (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.books (
  id text primary key,
  title text not null,
  authors text not null,
  thumbnail text
);

create table if not exists public.shelf_books (
  user_id uuid not null references auth.users (id) on delete cascade,
  book_id text not null references public.books (id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (user_id, book_id)
);

alter table public.bookshelves enable row level security;
alter table public.shelf_books enable row level security;

create policy "own bookshelf" on public.bookshelves
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own shelf books" on public.shelf_books
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table public.books enable row level security;

create policy "read books" on public.books
  for select using (true);

create policy "insert books" on public.books
  for insert with check (auth.uid() is not null);
