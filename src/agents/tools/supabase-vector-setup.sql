-- Supabase pgvector Setup for Knowledge Base
-- Run this SQL in your Supabase SQL Editor
-- Using FREE Google Gemini text-embedding-004 (768 dimensions)

-- 1. Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Create knowledge embeddings table
CREATE TABLE IF NOT EXISTS knowledge_embeddings (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  embedding vector(768), -- Google Gemini text-embedding-004 dimension (FREE)
  category TEXT,
  tags TEXT[],
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Create index for faster similarity search
-- IVFFlat index: good balance between speed and accuracy
CREATE INDEX IF NOT EXISTS knowledge_embeddings_embedding_idx 
ON knowledge_embeddings 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Optional: For better performance with larger datasets (>1M vectors), use HNSW index instead:
-- CREATE INDEX IF NOT EXISTS knowledge_embeddings_embedding_idx 
-- ON knowledge_embeddings 
-- USING hnsw (embedding vector_cosine_ops)
-- WITH (m = 16, ef_construction = 64);

-- 4. Create similarity search function
CREATE OR REPLACE FUNCTION match_knowledge_embeddings(
  query_embedding vector(768),
  match_threshold float,
  match_count int,
  filter_category text DEFAULT NULL,
  filter_tags text[] DEFAULT NULL
)
RETURNS TABLE (
  id text,
  content text,
  category text,
  tags text[],
  metadata jsonb,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    knowledge_embeddings.id,
    knowledge_embeddings.content,
    knowledge_embeddings.category,
    knowledge_embeddings.tags,
    knowledge_embeddings.metadata,
    1 - (knowledge_embeddings.embedding <=> query_embedding) as similarity
  FROM knowledge_embeddings
  WHERE 
    (filter_category IS NULL OR knowledge_embeddings.category = filter_category)
    AND (filter_tags IS NULL OR knowledge_embeddings.tags && filter_tags)
    AND 1 - (knowledge_embeddings.embedding <=> query_embedding) > match_threshold
  ORDER BY knowledge_embeddings.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- 5. Create updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_knowledge_embeddings_updated_at
BEFORE UPDATE ON knowledge_embeddings
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- 6. Grant permissions (adjust if needed for your setup)
-- For service role (already has access by default)
-- For authenticated users (if you want them to query):
-- ALTER TABLE knowledge_embeddings ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Allow authenticated read access" ON knowledge_embeddings
--   FOR SELECT TO authenticated USING (true);

-- Success message
DO $$ 
BEGIN 
  RAISE NOTICE 'pgvector knowledge base setup completed successfully!';
  RAISE NOTICE 'Table: knowledge_embeddings';
  RAISE NOTICE 'Dimension: 768 (Google Gemini text-embedding-004 - FREE)';
  RAISE NOTICE 'Index: IVFFlat (100 lists)';
  RAISE NOTICE 'Search function: match_knowledge_embeddings()';
END $$;
