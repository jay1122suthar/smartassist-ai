-- ==============================================================================
-- SmartAssist AI — Study Assistant Database Schema & Row Level Security (RLS)
-- Run this script in the Supabase SQL Editor (https://supabase.com/dashboard)
-- ==============================================================================

-- 1. Create public.study_sessions table
create table if not exists public.study_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  subject text not null,
  topic text not null,
  depth text not null default 'intermediate',
  mode text not null default 'explain', -- 'explain' | 'summarize' | 'mcq'
  notes text,
  result jsonb,
  score integer,
  mastered boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now()),
  updated_at timestamp with time zone default timezone('utc'::text, now())
);

-- Index for speedy queries by user and creation date
create index if not exists idx_study_sessions_user_date
  on public.study_sessions (user_id, created_at desc);

-- 2. Create public.study_progress table (Academic Progress Tracking)
create table if not exists public.study_progress (
  user_id uuid references auth.users(id) on delete cascade primary key,
  topics_mastered text[] default array[]::text[],
  explanations_completed integer default 0,
  quizzes_completed integer default 0,
  total_quiz_score integer default 0,
  total_quiz_questions integer default 0,
  retention_index integer default 85,
  updated_at timestamp with time zone default timezone('utc'::text, now())
);

-- 3. Enable Row Level Security (RLS) on both tables
alter table public.study_sessions enable row level security;
alter table public.study_progress enable row level security;

-- 4. RLS Policies for study_sessions: Users can ONLY access their own records
drop policy if exists "Users can view own study sessions" on public.study_sessions;
create policy "Users can view own study sessions"
  on public.study_sessions for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own study sessions" on public.study_sessions;
create policy "Users can insert own study sessions"
  on public.study_sessions for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own study sessions" on public.study_sessions;
create policy "Users can update own study sessions"
  on public.study_sessions for update
  using (auth.uid() = user_id);

drop policy if exists "Users can delete own study sessions" on public.study_sessions;
create policy "Users can delete own study sessions"
  on public.study_sessions for delete
  using (auth.uid() = user_id);

-- 5. RLS Policies for study_progress
drop policy if exists "Users can view own study progress" on public.study_progress;
create policy "Users can view own study progress"
  on public.study_progress for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own study progress" on public.study_progress;
create policy "Users can insert own study progress"
  on public.study_progress for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own study progress" on public.study_progress;
create policy "Users can update own study progress"
  on public.study_progress for update
  using (auth.uid() = user_id);
