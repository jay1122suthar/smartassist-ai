-- ============================================================================
-- SmartAssist AI — Chat with PDF Database Setup & Row Level Security
-- Run this script in your Supabase SQL Editor to enable persistent RAG storage.
-- ============================================================================

-- 1. PDF Documents Table
CREATE TABLE IF NOT EXISTS public.pdf_documents (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  file_size BIGINT NOT NULL DEFAULT 0,
  page_count INT NOT NULL DEFAULT 1,
  chunk_count INT NOT NULL DEFAULT 0,
  chapters JSONB DEFAULT '[]'::jsonb,
  suggested_questions JSONB DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'indexed',
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Index for fast user queries
CREATE INDEX IF NOT EXISTS idx_pdf_documents_user ON public.pdf_documents(user_id);
CREATE INDEX IF NOT EXISTS idx_pdf_documents_created ON public.pdf_documents(created_at DESC);

-- Enable RLS on pdf_documents
ALTER TABLE public.pdf_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own PDF documents"
  ON public.pdf_documents
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 2. PDF Chunks Table (stores page-by-page segmented text for retrieval)
CREATE TABLE IF NOT EXISTS public.pdf_chunks (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES public.pdf_documents(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  chunk_index INT NOT NULL,
  page_number INT NOT NULL,
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Indexes for chunk retrieval
CREATE INDEX IF NOT EXISTS idx_pdf_chunks_doc ON public.pdf_chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_pdf_chunks_user ON public.pdf_chunks(user_id);
CREATE INDEX IF NOT EXISTS idx_pdf_chunks_page ON public.pdf_chunks(document_id, page_number);

-- Enable RLS on pdf_chunks
ALTER TABLE public.pdf_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own document chunks"
  ON public.pdf_chunks
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 3. PDF Chat Messages Table (conversation history per document)
CREATE TABLE IF NOT EXISTS public.pdf_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id TEXT NOT NULL REFERENCES public.pdf_documents(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'model')),
  content TEXT NOT NULL,
  citations JSONB DEFAULT '[]'::jsonb,
  relevance_score NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_pdf_messages_doc ON public.pdf_messages(document_id);
CREATE INDEX IF NOT EXISTS idx_pdf_messages_user ON public.pdf_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_pdf_messages_created ON public.pdf_messages(created_at ASC);

-- Enable RLS on pdf_messages
ALTER TABLE public.pdf_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own PDF chat messages"
  ON public.pdf_messages
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
