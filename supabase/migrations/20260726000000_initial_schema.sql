-- Supabase Initial Migration for FactCheckerGraphDeepSeek
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Sessions
CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT,
    raw_text TEXT NOT NULL,
    provider TEXT DEFAULT 'openrouter',
    model TEXT DEFAULT 'gpt-oss-120b',
    status TEXT CHECK(status IN ('pending', 'processing', 'completed', 'failed')) DEFAULT 'pending',
    bewertung_fazit TEXT,
    bewertung_urteil TEXT CHECK(bewertung_urteil IN ('Wahr', 'Eher Wahr', 'Teilweise', 'Eher Falsch', 'Falsch', 'Unbelegt')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Speakers
CREATE TABLE IF NOT EXISTS speakers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Statements / Claims (Knoten)
CREATE TABLE IF NOT EXISTS statements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    speaker_id UUID REFERENCES speakers(id) ON DELETE SET NULL,
    inhalt TEXT NOT NULL,
    typ TEXT CHECK(typ IN ('faktisch', 'meinung', 'nicht_pruefbar')) DEFAULT 'faktisch',
    difficulty_score INTEGER CHECK(difficulty_score BETWEEN 0 AND 100),
    final_verdict TEXT CHECK(final_verdict IN ('Wahr', 'Eher Wahr', 'Teilweise', 'Eher Falsch', 'Falsch', 'Unbelegt')),
    final_evaluation TEXT,
    erwartete_bewertungen INTEGER DEFAULT 0,
    abgeschlossene_bewertungen INTEGER DEFAULT 0,
    status TEXT CHECK(status IN ('pending', 'searching', 'evaluating', 'completed', 'failed')) DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Queries (Suchanfragen per Statement)
CREATE TABLE IF NOT EXISTS queries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    statement_id UUID NOT NULL REFERENCES statements(id) ON DELETE CASCADE,
    inhalt TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Query Results (Gefundene Quellen)
CREATE TABLE IF NOT EXISTS query_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    query_id UUID NOT NULL REFERENCES queries(id) ON DELETE CASCADE,
    statement_id UUID NOT NULL REFERENCES statements(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    title TEXT,
    snippets JSONB DEFAULT '[]'::jsonb,
    inhalt JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Fact Check Sources / Einzelbewertungen (Quellen-Evaluierung)
CREATE TABLE IF NOT EXISTS fact_check_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    statement_id UUID NOT NULL REFERENCES statements(id) ON DELETE CASCADE,
    query_result_id UUID REFERENCES query_results(id) ON DELETE CASCADE,
    urteil TEXT CHECK(urteil IN ('stuetzt', 'widerlegt', 'irrelevant')) NOT NULL,
    konfidenz REAL CHECK(konfidenz BETWEEN 0.0 AND 1.0),
    begruendung TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Relations (Kanten)
CREATE TABLE IF NOT EXISTS relations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    from_statement_id UUID NOT NULL REFERENCES statements(id) ON DELETE CASCADE,
    to_statement_id UUID NOT NULL REFERENCES statements(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK(type IN ('implication', 'conjunction', 'disjunction', 'supports', 'contradiction', 'fallacy', 'restates')),
    label TEXT,
    reasoning TEXT
);

-- 8. Fallacies (Fehlschlüsse)
CREATE TABLE IF NOT EXISTS fallacies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    statement_id UUID NOT NULL REFERENCES statements(id) ON DELETE CASCADE,
    fallacy_type TEXT NOT NULL,
    reasoning TEXT NOT NULL
);

-- Indices for Fast Queries
CREATE INDEX IF NOT EXISTS idx_statements_session ON statements(session_id);
CREATE INDEX IF NOT EXISTS idx_queries_statement ON queries(statement_id);
CREATE INDEX IF NOT EXISTS idx_query_results_statement ON query_results(statement_id);
CREATE INDEX IF NOT EXISTS idx_sources_statement ON fact_check_sources(statement_id);
CREATE INDEX IF NOT EXISTS idx_relations_session ON relations(session_id);

-- Enable Supabase Realtime for instant frontend UI updates
ALTER PUBLICATION supabase_realtime ADD TABLE sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE statements;
ALTER PUBLICATION supabase_realtime ADD TABLE queries;
ALTER PUBLICATION supabase_realtime ADD TABLE query_results;
ALTER PUBLICATION supabase_realtime ADD TABLE fact_check_sources;
ALTER PUBLICATION supabase_realtime ADD TABLE relations;
ALTER PUBLICATION supabase_realtime ADD TABLE fallacies;

-- Row Level Security (RLS) Policies
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE statements ENABLE ROW LEVEL SECURITY;
ALTER TABLE queries ENABLE ROW LEVEL SECURITY;
ALTER TABLE query_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE fact_check_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE relations ENABLE ROW LEVEL SECURITY;
ALTER TABLE fallacies ENABLE ROW LEVEL SECURITY;

-- Allow public read & write access for development/demo mode
DROP POLICY IF EXISTS "Public Read Sessions" ON sessions;
CREATE POLICY "Public Read Sessions" ON sessions FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public Insert Sessions" ON sessions;
CREATE POLICY "Public Insert Sessions" ON sessions FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Public Update Sessions" ON sessions;
CREATE POLICY "Public Update Sessions" ON sessions FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Public Read Statements" ON statements;
CREATE POLICY "Public Read Statements" ON statements FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public Insert Statements" ON statements;
CREATE POLICY "Public Insert Statements" ON statements FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Public Update Statements" ON statements;
CREATE POLICY "Public Update Statements" ON statements FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Public Read Queries" ON queries;
CREATE POLICY "Public Read Queries" ON queries FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public Insert Queries" ON queries;
CREATE POLICY "Public Insert Queries" ON queries FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Public Read Query Results" ON query_results;
CREATE POLICY "Public Read Query Results" ON query_results FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public Insert Query Results" ON query_results;
CREATE POLICY "Public Insert Query Results" ON query_results FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Public Read Fact Check Sources" ON fact_check_sources;
CREATE POLICY "Public Read Fact Check Sources" ON fact_check_sources FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public Insert Fact Check Sources" ON fact_check_sources;
CREATE POLICY "Public Insert Fact Check Sources" ON fact_check_sources FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Public Read Relations" ON relations;
CREATE POLICY "Public Read Relations" ON relations FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public Insert Relations" ON relations;
CREATE POLICY "Public Insert Relations" ON relations FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Public Read Fallacies" ON fallacies;
CREATE POLICY "Public Read Fallacies" ON fallacies FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public Insert Fallacies" ON fallacies;
CREATE POLICY "Public Insert Fallacies" ON fallacies FOR INSERT WITH CHECK (true);
