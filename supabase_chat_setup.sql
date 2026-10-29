-- ==============================================================================
-- SmartAssist AI — Chat Conversations Database Schema & Row Level Security (RLS)
-- Run this script in the Supabase SQL Editor (https://supabase.com/dashboard)
-- ==============================================================================

-- 1. Create public.chat_conversations table
create table if not exists public.chat_conversations (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  title text not null default 'New Conversation',
  messages jsonb not null default '[]'::jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()),
  updated_at timestamp with time zone default timezone('utc'::text, now())
);

-- Index for fast user queries ordered by updated_at
create index if not exists idx_chat_conversations_user_updated
  on public.chat_conversations (user_id, updated_at desc);

-- 2. Add section and metadata columns for multi-section isolation
alter table public.chat_conversations
  add column if not exists section text not null default 'general_chat';

alter table public.chat_conversations
  add column if not exists metadata jsonb not null default '{}'::jsonb;

-- Index for filtering by user and section
create index if not exists idx_chat_conversations_user_section
  on public.chat_conversations (user_id, section, updated_at desc);

-- 3. Enable Row Level Security (RLS)
alter table public.chat_conversations enable row level security;

-- 4. RLS Policies: Authenticated users can ONLY manage their own conversations
drop policy if exists "Users can view own chat conversations" on public.chat_conversations;
create policy "Users can view own chat conversations"
  on public.chat_conversations for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own chat conversations" on public.chat_conversations;
create policy "Users can insert own chat conversations"
  on public.chat_conversations for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own chat conversations" on public.chat_conversations;
create policy "Users can update own chat conversations"
  on public.chat_conversations for update
  using (auth.uid() = user_id);

drop policy if exists "Users can delete own chat conversations" on public.chat_conversations;
create policy "Users can delete own chat conversations"
  on public.chat_conversations for delete
  using (auth.uid() = user_id);

