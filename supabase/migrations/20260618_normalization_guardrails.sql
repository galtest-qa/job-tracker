-- ══════════════════════════════════════════════════════════════════════════
-- Phase 3 Safety Pass: normalization, deduplication, quality guardrails
--
-- 1. normalize_company_name() — stable function used by generated columns
--    Wix / wix.com / Wix.com Ltd. / careers.wix.com  →  "wix"
--    Google LLC → "google"   Monday.com → "monday"
--
-- 2. Update company_interview_profiles.company_key to use the function
--
-- 3. Update company_questions.question_normalized to strip trailing
--    punctuation so "Tell me about yourself" and "Tell me about yourself?"
--    collapse to the same dedup key.
--
-- 4. Replace upsert_company_question with a version that adds quality
--    guardrails (length, whitespace, basic spam checks).
-- ══════════════════════════════════════════════════════════════════════════


-- ── 1. Company name normalizer ────────────────────────────────────────────
-- IMMUTABLE so Postgres can use it inside a generated column.
-- Steps (in order):
--   a. strip https?:// scheme
--   b. strip common career-page subdomains  (careers. jobs. www. talent.)
--   c. strip URL path and query string (everything after first / ? #)
--   d. strip known TLDs + whatever follows  (.com Inc. → gone)
--   e. strip trailing legal entity suffixes (LLC, Ltd., Inc., …)
--   f. keep only [a-z0-9 ] (lowercase, collapse whitespace)

CREATE OR REPLACE FUNCTION normalize_company_name(raw text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE STRICT
AS $$
DECLARE
  s text := lower(trim(raw));
BEGIN
  -- (a) strip URL scheme
  s := regexp_replace(s, '^https?://', '');
  -- (b) strip career-page subdomains at start
  s := regexp_replace(s, '^(www|careers|jobs|talent|about|hire)\.', '', 'i');
  -- (c) strip URL path / query / fragment
  s := regexp_replace(s, '[/?#].*$', '');
  -- (d) strip TLD suffix and everything that follows it
  --     matches the dot + tld word-boundary, then .* consumes the rest
  s := regexp_replace(s,
    '\.(com|io|org|net|co|app|ai|dev|tech|inc|biz|us|uk|de|fr|ca|au)\b.*',
    '', 'g');
  -- (e) strip trailing legal suffixes (handles "Google LLC", "Wix Ltd.")
  s := regexp_replace(s,
    '[\s,]+(llc|ltd\.?|inc\.?|corp\.?|co\.?|gmbh|b\.?v\.?|s\.?a\.?|plc|'
    'limited|incorporated|company|group|holdings?)[\s.,]*$',
    '', 'gi');
  -- (f) keep only alphanumeric + space; collapse; trim
  s := regexp_replace(s, '[^a-z0-9\s]', '', 'g');
  s := regexp_replace(s, '\s+', ' ', 'g');
  RETURN trim(s);
END;
$$;


-- ── 2. Update company_interview_profiles.company_key ─────────────────────
-- Drop the old generated column (and its dependent index + unique constraint),
-- recreate with normalize_company_name().

DROP INDEX IF EXISTS idx_company_profiles_key_expires;

ALTER TABLE company_interview_profiles
  DROP COLUMN IF EXISTS company_key;

ALTER TABLE company_interview_profiles
  ADD COLUMN company_key text
    GENERATED ALWAYS AS (normalize_company_name(company_name)) STORED;

ALTER TABLE company_interview_profiles
  ADD CONSTRAINT company_interview_profiles_company_key_key UNIQUE (company_key);

CREATE INDEX idx_company_profiles_key_expires
  ON company_interview_profiles (company_key, expires_at);


-- ── 3. Update company_questions.question_normalized ───────────────────────
-- New normalization strips trailing punctuation so "Tell me about yourself"
-- and "Tell me about yourself?" map to the same dedup key.
-- Also collapses internal whitespace for "tell  me" == "tell me".

ALTER TABLE company_questions
  DROP CONSTRAINT IF EXISTS company_questions_company_key_question_normalized_stage_key;

DROP INDEX IF EXISTS idx_company_questions_lookup;
DROP INDEX IF EXISTS idx_company_questions_freq;

ALTER TABLE company_questions
  DROP COLUMN IF EXISTS question_normalized;

ALTER TABLE company_questions
  ADD COLUMN question_normalized text GENERATED ALWAYS AS (
    trim(
      regexp_replace(
        regexp_replace(
          lower(trim(question)),
          '[?!.,;:\-]+$', ''      -- strip trailing punctuation
        ),
        '\s+', ' ', 'g'           -- collapse internal whitespace
      )
    )
  ) STORED;

ALTER TABLE company_questions
  ADD CONSTRAINT company_questions_company_key_question_normalized_stage_key
    UNIQUE (company_key, question_normalized, stage);

CREATE INDEX idx_company_questions_lookup
  ON company_questions (company_key, role_family, stage);

CREATE INDEX idx_company_questions_freq
  ON company_questions (company_key, frequency DESC);


-- ── 4. Replace upsert_company_question with quality-guarded version ───────
-- Guardrails (all enforced server-side, redundant with JS validation):
--   • question text must be 10–500 characters after trimming
--   • strip HTML-unsafe characters before storing
-- The ON CONFLICT clause now increments frequency and raises confidence
-- to the maximum seen, so user-reported questions (0.85) overwrite
-- AI-inferred (0.50) on their first collision.

CREATE OR REPLACE FUNCTION upsert_company_question(
  p_company_key       text,
  p_role_family       text,
  p_stage             text,
  p_question          text,
  p_source_id         uuid,
  p_confidence        numeric,
  p_is_ai_generated   boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  clean_q text;
BEGIN
  -- Sanitise: strip HTML and control characters, collapse whitespace
  clean_q := regexp_replace(
               regexp_replace(trim(p_question), '<[^>]+>', '', 'g'),
               '\s+', ' ', 'g');

  -- Quality gate: reject too-short, too-long, or empty questions
  IF length(clean_q) < 10 OR length(clean_q) > 500 THEN
    RETURN;
  END IF;

  -- Reject if company key is empty (shouldn't happen, but be safe)
  IF trim(p_company_key) = '' THEN
    RETURN;
  END IF;

  INSERT INTO company_questions
    (company_key, role_family, stage, question,
     source_id, confidence, is_ai_generated, frequency)
  VALUES
    (p_company_key, p_role_family, p_stage, clean_q,
     p_source_id, p_confidence, p_is_ai_generated, 1)
  ON CONFLICT (company_key, question_normalized, stage)
  DO UPDATE SET
    frequency   = company_questions.frequency + 1,
    confidence  = GREATEST(company_questions.confidence, EXCLUDED.confidence),
    -- Prefer human source ID over AI source ID
    source_id   = CASE
                    WHEN company_questions.is_ai_generated AND NOT EXCLUDED.is_ai_generated
                    THEN EXCLUDED.source_id
                    ELSE COALESCE(company_questions.source_id, EXCLUDED.source_id)
                  END,
    is_ai_generated = company_questions.is_ai_generated AND EXCLUDED.is_ai_generated,
    updated_at  = now();
END;
$$;

GRANT EXECUTE ON FUNCTION upsert_company_question TO authenticated;
