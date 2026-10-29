-- ==============================================================================
-- SmartAssist AI — Code Assistant Database Schema & Row Level Security (RLS)
-- Run this script in the Supabase SQL Editor (https://supabase.com/dashboard)
-- ==============================================================================

-- 1. Create public.code_sessions table
create table if not exists public.code_sessions (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  title text not null default 'Untitled Coding Session',
  language text not null default 'python',
  filename text not null default 'main.py',
  code text not null,
  prompt text,
  mode text not null default 'debug', -- 'debug' | 'explain' | 'generate' | 'improve'
  result jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()),
  updated_at timestamp with time zone default timezone('utc'::text, now())
);

-- Index for speedy queries by user and update date
create index if not exists idx_code_sessions_user_date
  on public.code_sessions (user_id, updated_at desc);

-- 2. Enable Row Level Security (RLS)
alter table public.code_sessions enable row level security;

-- 3. RLS Policies: Users can ONLY access their own records
drop policy if exists "Users can view own code sessions" on public.code_sessions;
create policy "Users can view own code sessions"
  on public.code_sessions for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own code sessions" on public.code_sessions;
create policy "Users can insert own code sessions"
  on public.code_sessions for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own code sessions" on public.code_sessions;
create policy "Users can update own code sessions"
  on public.code_sessions for update
  using (auth.uid() = user_id);

drop policy if exists "Users can delete own code sessions" on public.code_sessions;
create policy "Users can delete own code sessions"
  on public.code_sessions for delete
  using (auth.uid() = user_id);
