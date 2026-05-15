-- Sample extraction pipeline
-- Strip-mines audio material for reusable one-shot samples: drum hits,
-- instrument notes, synth stabs, vocal chops, FX.
--
-- This is the "SF2 for the modern era" pipeline. Every extracted sample IS a
-- roseglassdb_master_audio row. roseglassdb_instrument_samples adds the
-- semantic layer: what instrument, what pitch, where in the source it came from.
--
-- Flow:
--   1. Source audio (track, stem, or loop) → roseglassdb_sample_extraction_jobs
--   2. Worker runs onset detection (Essentia) or beat-aligned slicing
--   3. Each hit/note → new roseglassdb_master_audio row + roseglassdb_instrument_samples row
--   4. Embedding computed → stored in roseglassdb_media_analysis
--   5. Near-duplicate check: cosine similarity vs existing samples of same category
--      → sets near_duplicate_of + similarity_score if above threshold (default 0.95)
--   6. Kit auto-formed from all samples sharing the same extraction job
--   7. NOTIFY on 'sample_extraction_complete'
--
-- Instrument taxonomy:
--   instrument_family: 'drums' | 'melodic' | 'bass' | 'fx' | 'vocal' | 'other'
--   instrument_category (within family):
--     drums:   kick, snare, hihat_closed, hihat_open, hihat_pedal, clap, rimshot,
--              tom_high, tom_mid, tom_floor, cymbal_crash, cymbal_ride, cymbal_china,
--              shaker, conga, bongo, perc_other
--     melodic: piano_note, synth_lead, synth_stab, synth_pad, guitar_note,
--              string_note, brass_note, woodwind_note, mallet_note, organ_note
--     bass:    bass_note, sub_hit, bass_stab
--     fx:      riser, impact, downlifter, sweep, texture, foley
--     vocal:   vocal_chop, adlib, spoken_word, breath
--     other:   unknown
--
-- Kit coherence:
--   Samples sharing an extraction job auto-form a kit candidate.
--   kit_coherence_score is computed post-extraction: measures consistency of
--   transient envelope shape, spectral centroid variance, and implied room/saturation.
--   High coherence (>0.8) = these sounds were clearly recorded/processed together.
--   Low coherence = mixed sources, but may still be intentionally curated.

BEGIN;

-- ─────────────────────────────────────────────
-- SAMPLE EXTRACTION JOBS
-- One job = one source audio × one extraction pass.
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.roseglassdb_sample_extraction_jobs
(
    id                   serial NOT NULL,
    source_audio_id      integer NOT NULL,
    -- Which stem split job produced the source (if extracted from a stem, not raw audio)
    stem_split_job_id    integer,
    -- 'onset_detection'  = Essentia transient detector, good for drums
    -- 'pitch_segmented'  = note onset from pitch tracker, good for melodic material
    -- 'beat_aligned'     = slice at beat grid positions (requires beat_analysis_id)
    -- 'manual'           = user-defined slice points
    extraction_method    text NOT NULL DEFAULT 'onset_detection',
    beat_analysis_id     integer,          -- FK to beat_grid analysis if beat_aligned
    -- Onset detection params. NULL = defaults.
    -- Example: {"threshold": 0.35, "min_duration_ms": 30, "max_duration_ms": 2000,
    --           "pre_roll_ms": 10, "silence_floor_db": -60}
    detection_params     jsonb,
    -- Target instrument family to look for. NULL = detect everything.
    target_family        text,
    status               text NOT NULL DEFAULT 'pending', -- pending|running|complete|error
    samples_produced     integer DEFAULT 0,
    started_at           timestamptz,
    finished_at          timestamptz,
    error_text           text,
    notes                text,
    created_at           timestamptz DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT roseglassdb_sample_extraction_jobs_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS ix_rsej_source ON public.roseglassdb_sample_extraction_jobs(source_audio_id);
CREATE INDEX IF NOT EXISTS ix_rsej_status ON public.roseglassdb_sample_extraction_jobs(status);

ALTER TABLE IF EXISTS public.roseglassdb_sample_extraction_jobs
    ADD CONSTRAINT fk_rsej_source FOREIGN KEY (source_audio_id)
    REFERENCES public.roseglassdb_master_audio (id) ON DELETE CASCADE;

ALTER TABLE IF EXISTS public.roseglassdb_sample_extraction_jobs
    ADD CONSTRAINT fk_rsej_stem_job FOREIGN KEY (stem_split_job_id)
    REFERENCES public.roseglassdb_stem_split_jobs (id) ON DELETE SET NULL;

ALTER TABLE IF EXISTS public.roseglassdb_sample_extraction_jobs
    ADD CONSTRAINT fk_rsej_beat FOREIGN KEY (beat_analysis_id)
    REFERENCES public.roseglassdb_media_analysis (id) ON DELETE SET NULL;

-- ─────────────────────────────────────────────
-- INSTRUMENT SAMPLES
-- Semantic layer on top of master_audio rows.
-- Each sample IS a roseglassdb_master_audio row.
--
-- near_duplicate_of: if this sample is very similar to an existing one
--   (cosine similarity above threshold), points to the earlier sample.
--   The new sample is still stored — sha256 handles exact dedup already;
--   this flags perceptual near-dupes so the UI can collapse them without
--   discarding the slightly different version.
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.roseglassdb_instrument_samples
(
    id                  serial NOT NULL,
    audio_id            integer NOT NULL,   -- the sample IS a master_audio row
    job_id              integer NOT NULL,   -- which extraction job produced it
    instrument_family   text NOT NULL,      -- 'drums' | 'melodic' | 'bass' | 'fx' | 'vocal' | 'other'
    instrument_category text NOT NULL,      -- 'kick', 'snare', 'piano_note', etc.
    -- Pitch info. NULL for unpitched sounds (kicks, snares, FX).
    pitch_midi          smallint,           -- 0-127 MIDI note number
    pitch_confidence    real,               -- 0-1; NULL if not attempted
    -- Dynamics
    velocity_estimate   smallint,           -- 0-127 approximation
    peak_db             real,               -- peak level in dBFS
    -- Where in source this event was detected
    onset_ms            integer NOT NULL,
    duration_ms         integer NOT NULL,
    -- Near-duplicate handling
    near_duplicate_of   integer,            -- FK to roseglassdb_instrument_samples(id)
    similarity_score    real,               -- cosine similarity to near_duplicate_of
    -- Additional properties
    is_one_shot         boolean DEFAULT true,  -- false = sustained/looped
    attributes          jsonb,              -- free-form: {"has_reverb": true, "transient_sharpness": 0.8}
    CONSTRAINT roseglassdb_instrument_samples_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS ix_ris_audio    ON public.roseglassdb_instrument_samples(audio_id);
CREATE INDEX IF NOT EXISTS ix_ris_job      ON public.roseglassdb_instrument_samples(job_id);
CREATE INDEX IF NOT EXISTS ix_ris_family   ON public.roseglassdb_instrument_samples(instrument_family);
CREATE INDEX IF NOT EXISTS ix_ris_category ON public.roseglassdb_instrument_samples(instrument_category);
CREATE INDEX IF NOT EXISTS ix_ris_pitch    ON public.roseglassdb_instrument_samples(pitch_midi) WHERE pitch_midi IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_ris_neardup  ON public.roseglassdb_instrument_samples(near_duplicate_of) WHERE near_duplicate_of IS NOT NULL;

ALTER TABLE IF EXISTS public.roseglassdb_instrument_samples
    ADD CONSTRAINT fk_ris_audio FOREIGN KEY (audio_id)
    REFERENCES public.roseglassdb_master_audio (id) ON DELETE RESTRICT;

ALTER TABLE IF EXISTS public.roseglassdb_instrument_samples
    ADD CONSTRAINT fk_ris_job FOREIGN KEY (job_id)
    REFERENCES public.roseglassdb_sample_extraction_jobs (id) ON DELETE CASCADE;

ALTER TABLE IF EXISTS public.roseglassdb_instrument_samples
    ADD CONSTRAINT fk_ris_neardup FOREIGN KEY (near_duplicate_of)
    REFERENCES public.roseglassdb_instrument_samples (id) ON DELETE SET NULL;

-- ─────────────────────────────────────────────
-- SAMPLE KITS
-- A kit is a named collection of samples that belong together.
-- Auto-kits: created automatically from each extraction job (same source track).
-- Curated kits: manually assembled from samples across multiple sources.
--
-- kit_coherence_score: 0-1, computed post-extraction.
--   Measures how consistently the samples in this kit "sound like they belong together"
--   (transient envelope similarity, spectral centroid variance, implied room character).
--   NULL until the coherence analysis worker runs.
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.roseglassdb_sample_kits
(
    id                   serial NOT NULL,
    name                 text NOT NULL,
    kit_type             text NOT NULL DEFAULT 'drum_kit',
    -- 'drum_kit' | 'instrument_set' | 'mixed' | 'curated'
    -- Source track this kit was mined from. NULL for curated cross-source kits.
    source_audio_id      integer,
    -- NULL for curated kits; set for auto-kits from extraction jobs
    extraction_job_id    integer,
    kit_coherence_score  real,
    notes                text,
    created_at           timestamptz DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT roseglassdb_sample_kits_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS ix_rsk_source ON public.roseglassdb_sample_kits(source_audio_id);
CREATE INDEX IF NOT EXISTS ix_rsk_job    ON public.roseglassdb_sample_kits(extraction_job_id);

ALTER TABLE IF EXISTS public.roseglassdb_sample_kits
    ADD CONSTRAINT fk_rsk_source FOREIGN KEY (source_audio_id)
    REFERENCES public.roseglassdb_master_audio (id) ON DELETE SET NULL;

ALTER TABLE IF EXISTS public.roseglassdb_sample_kits
    ADD CONSTRAINT fk_rsk_job FOREIGN KEY (extraction_job_id)
    REFERENCES public.roseglassdb_sample_extraction_jobs (id) ON DELETE SET NULL;

-- ─────────────────────────────────────────────
-- SAMPLE KIT MEMBERS
-- Maps samples to kits with an optional role.
-- role: the function this sample plays in the kit.
--   For drum kits: 'kick', 'snare_main', 'snare_ghost', 'hihat_closed',
--                  'hihat_open', 'clap', 'rimshot', 'tom_high', 'crash', etc.
--   For instrument sets: 'root', 'octave_up', 'fifth', 'velocity_soft',
--                        'velocity_hard', 'release', etc.
--   NULL = unassigned (in auto-kits before roles are labeled)
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.roseglassdb_sample_kit_members
(
    id         serial NOT NULL,
    kit_id     integer NOT NULL,
    sample_id  integer NOT NULL,
    role       text,
    CONSTRAINT roseglassdb_sample_kit_members_pkey PRIMARY KEY (id),
    CONSTRAINT ux_rskm_kit_sample UNIQUE (kit_id, sample_id)
);

CREATE INDEX IF NOT EXISTS ix_rskm_kit    ON public.roseglassdb_sample_kit_members(kit_id);
CREATE INDEX IF NOT EXISTS ix_rskm_sample ON public.roseglassdb_sample_kit_members(sample_id);

ALTER TABLE IF EXISTS public.roseglassdb_sample_kit_members
    ADD CONSTRAINT fk_rskm_kit FOREIGN KEY (kit_id)
    REFERENCES public.roseglassdb_sample_kits (id) ON DELETE CASCADE;

ALTER TABLE IF EXISTS public.roseglassdb_sample_kit_members
    ADD CONSTRAINT fk_rskm_sample FOREIGN KEY (sample_id)
    REFERENCES public.roseglassdb_instrument_samples (id) ON DELETE CASCADE;

-- ─────────────────────────────────────────────
-- NOTIFY TRIGGER
-- ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_notify_sample_extraction_complete()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.status = 'complete'
       AND (OLD.status IS DISTINCT FROM 'complete')
    THEN
        PERFORM pg_notify(
            'sample_extraction_complete',
            json_build_object(
                'job_id',          NEW.id,
                'source_audio_id', NEW.source_audio_id,
                'samples_produced', NEW.samples_produced,
                'finished_at',     NEW.finished_at
            )::text
        );
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_sample_extraction_complete
    AFTER UPDATE ON public.roseglassdb_sample_extraction_jobs
    FOR EACH ROW EXECUTE FUNCTION public.fn_notify_sample_extraction_complete();

-- ─────────────────────────────────────────────
-- HELPER: find perceptually similar samples
--
-- Queries the embedding index for samples of the same instrument_category.
-- Returns samples closest in the latent space to the given sample.
-- Requires roseglassdb_media_analysis embeddings to be populated first.
--
-- Usage: SELECT * FROM find_similar_samples(sample_id := 42, max_results := 10);
-- ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.find_similar_samples(
    p_sample_id  integer,
    p_max_results integer DEFAULT 10
)
RETURNS TABLE (
    sample_id           integer,
    instrument_category text,
    instrument_family   text,
    pitch_midi          smallint,
    similarity          real,
    audio_id            integer,
    original_filename   text,
    duration_ms         integer
)
LANGUAGE sql STABLE AS $$
    WITH target AS (
        SELECT
            s.instrument_category,
            ma.embedding
        FROM roseglassdb_instrument_samples s
        JOIN roseglassdb_media_analysis ma ON ma.audio_id = s.audio_id
        WHERE s.id = p_sample_id
          AND ma.embedding IS NOT NULL
        LIMIT 1
    )
    SELECT
        s.id,
        s.instrument_category,
        s.instrument_family,
        s.pitch_midi,
        (1.0 - (ma.embedding <=> t.embedding))::real AS similarity,
        s.audio_id,
        a.original_filename,
        s.duration_ms
    FROM roseglassdb_instrument_samples s
    JOIN roseglassdb_media_analysis ma ON ma.audio_id = s.audio_id
    JOIN roseglassdb_master_audio    a  ON a.id = s.audio_id
    CROSS JOIN target t
    WHERE s.id <> p_sample_id
      AND s.instrument_category = t.instrument_category
      AND ma.embedding IS NOT NULL
    ORDER BY ma.embedding <=> t.embedding
    LIMIT p_max_results;
$$;

-- ─────────────────────────────────────────────
-- HELPER: get all samples in a kit
--
-- Usage: SELECT * FROM get_kit_samples(kit_id := 7);
-- ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_kit_samples(p_kit_id integer)
RETURNS TABLE (
    role                text,
    instrument_category text,
    instrument_family   text,
    pitch_midi          smallint,
    velocity_estimate   smallint,
    peak_db             real,
    onset_ms            integer,
    duration_ms         integer,
    sample_id           integer,
    audio_id            integer,
    original_filename   text
)
LANGUAGE sql STABLE AS $$
    SELECT
        m.role,
        s.instrument_category,
        s.instrument_family,
        s.pitch_midi,
        s.velocity_estimate,
        s.peak_db,
        s.onset_ms,
        s.duration_ms,
        s.id,
        s.audio_id,
        a.original_filename
    FROM roseglassdb_sample_kit_members m
    JOIN roseglassdb_instrument_samples s ON s.id = m.sample_id
    JOIN roseglassdb_master_audio       a ON a.id = s.audio_id
    WHERE m.kit_id = p_kit_id
    ORDER BY s.instrument_family, s.instrument_category, s.pitch_midi NULLS LAST;
$$;

END;
