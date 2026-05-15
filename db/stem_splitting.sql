-- Stem splitting pipeline
-- Extends the loop system: loops go in → stems come out.
--
-- Key design:
--   Each stem IS a roseglassdb_master_audio row.
--     - source_audio_id → parent loop (provenance intact)
--     - original_filename → {parent_name}_{stem_label}.{ext}
--     - sha256 dedup applies: identical stems across different runs collapse to one row
--   roseglassdb_audio_stems adds the semantic metadata (label, splitter, energy).
--
-- Splitter taxonomy:
--   Conventional splitters (Demucs, Spleeter, Open-Unmix): fixed stem_taxonomy,
--     trained on drums/bass/vocals/other patterns.
--   Adaptive splitters (NMF, ICA): stem_taxonomy = NULL, is_adaptive = TRUE,
--     stem count and labels determined from the audio's actual spectral content.
--   Crossover splitter: deterministic frequency-band splits, no ML,
--     works on anything, zero bleed.
--
-- Routing logic (stored in spectral_profile analysis):
--   material_type = 'conventional'  → Demucs htdemucs (6-stem or 4-stem)
--   material_type = 'tonal'         → NMF-adaptive or crossover-4band
--   material_type = 'noise'         → crossover-4band or ICA
--   material_type = 'sparse'        → Demucs 2-stem or NMF-adaptive
--
-- The spectral_profile analysis lives in roseglassdb_media_analysis:
--   analysis_type = 'spectral_profile'
--   result_json: {
--     "material_type": "conventional",
--     "spectral_flatness": 0.12,
--     "dominant_freq_bands": 4,
--     "suggested_stem_count": 4,
--     "suggested_splitter": "demucs-htdemucs",
--     "has_transients": true,
--     "has_pitched_content": true,
--     "has_noise_floor": false
--   }

BEGIN;

-- ─────────────────────────────────────────────
-- STEM SPLITTER REGISTRY
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.roseglassdb_stem_splitters
(
    id                    serial NOT NULL,
    name                  text NOT NULL,       -- 'demucs-htdemucs', 'spleeter-4stem', etc.
    version               text,
    -- NULL for adaptive splitters (labels emerge from the audio)
    stem_taxonomy         text[],              -- ['drums','bass','vocals','other']
    supported_stem_counts integer[],           -- [2,4,6] or NULL for adaptive
    is_adaptive           boolean DEFAULT false,
    -- 'ml'=trained neural net, 'nmf'=non-negative matrix factorization,
    -- 'ica'=independent component analysis, 'crossover'=frequency band split
    method                text,
    notes                 text,
    created_at            timestamptz DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT roseglassdb_stem_splitters_pkey PRIMARY KEY (id),
    CONSTRAINT roseglassdb_stem_splitters_name_version_key UNIQUE (name, version)
);

-- Known open-source splitters worth running
INSERT INTO public.roseglassdb_stem_splitters
    (name, version, stem_taxonomy, supported_stem_counts, is_adaptive, method, notes)
VALUES

-- Best overall quality for conventional music
('demucs-htdemucs', '4.1.1',
 ARRAY['drums','bass','vocals','other'],
 ARRAY[2,4,6],
 false, 'ml',
 'Meta hybrid transformer Demucs. 6-stem adds guitar+piano. Best quality for conventional material.'),

-- Faster, lower quality, good for bulk passes
('spleeter-4stem', '2.3',
 ARRAY['drums','bass','vocals','other'],
 ARRAY[2,4,5],
 false, 'ml',
 'Deezer Spleeter. Fast CPU-friendly option. 5-stem adds piano.'),

-- Good vocal isolation specifically
('open-unmix', '1.0',
 ARRAY['drums','bass','vocals','other'],
 ARRAY[4],
 false, 'ml',
 'Open-Unmix (UMX). Strong vocals/accompaniment separation.'),

-- Adaptive: finds actual spectral components, no taxonomy assumed
('nmf-adaptive', '1.0',
 NULL,
 NULL,
 true, 'nmf',
 'Non-negative matrix factorization. stem_count set per-job from spectral_profile suggestion. '
 'No prior assumption about what stems should be. Good for experimental/electronic/noise.'),

-- Deterministic, no ML, works on anything
('crossover-4band', '1.0',
 ARRAY['low','low_mid','high_mid','high'],
 ARRAY[4],
 false, 'crossover',
 'Frequency-band crossover: 0-250Hz / 250-2kHz / 2-8kHz / 8kHz+. '
 'Deterministic, zero bleed, no ML. Best fallback for material that confuses neural splitters.'),

('crossover-2band', '1.0',
 ARRAY['sub_bass','above'],
 ARRAY[2],
 false, 'crossover',
 'Simple 80Hz crossover. Useful as a first pass on bass-heavy material.'),

-- ICA for statistically independent component separation
('ica-adaptive', '1.0',
 NULL,
 NULL,
 true, 'ica',
 'Independent Component Analysis. stem_count set per-job. '
 'Best for material with genuinely independent signal sources.')

ON CONFLICT (name, version) DO NOTHING;

-- ─────────────────────────────────────────────
-- STEM SPLIT JOBS
-- One job = one source audio × one splitter run.
-- Multiple jobs for the same loop → multiple stem sets (different splitters).
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.roseglassdb_stem_split_jobs
(
    id                   serial NOT NULL,
    source_audio_id      integer NOT NULL,
    splitter_id          integer NOT NULL,
    -- for adaptive splitters: NULL = let spectral_profile decide
    requested_stem_count integer,
    -- FK to the spectral_profile analysis that informed routing
    spectral_profile_id  integer,
    status               text NOT NULL DEFAULT 'pending',  -- pending|running|complete|error
    stems_produced       integer DEFAULT 0,
    started_at           timestamptz,
    finished_at          timestamptz,
    error_text           text,
    notes                text,
    created_at           timestamptz DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT roseglassdb_stem_split_jobs_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS ix_rssj_source    ON public.roseglassdb_stem_split_jobs(source_audio_id);
CREATE INDEX IF NOT EXISTS ix_rssj_splitter  ON public.roseglassdb_stem_split_jobs(splitter_id);
CREATE INDEX IF NOT EXISTS ix_rssj_status    ON public.roseglassdb_stem_split_jobs(status);

ALTER TABLE IF EXISTS public.roseglassdb_stem_split_jobs
    ADD CONSTRAINT fk_rssj_source FOREIGN KEY (source_audio_id)
    REFERENCES public.roseglassdb_master_audio (id) ON DELETE CASCADE;

ALTER TABLE IF EXISTS public.roseglassdb_stem_split_jobs
    ADD CONSTRAINT fk_rssj_splitter FOREIGN KEY (splitter_id)
    REFERENCES public.roseglassdb_stem_splitters (id) ON DELETE RESTRICT;

ALTER TABLE IF EXISTS public.roseglassdb_stem_split_jobs
    ADD CONSTRAINT fk_rssj_profile FOREIGN KEY (spectral_profile_id)
    REFERENCES public.roseglassdb_media_analysis (id) ON DELETE SET NULL;

-- ─────────────────────────────────────────────
-- AUDIO STEMS
-- Semantic metadata layer on top of master_audio rows.
-- Each stem IS a roseglassdb_master_audio row:
--   stem_audio.source_audio_id = parent loop (provenance)
--   stem_audio.original_filename = '{parent_filename}_{stem_label}.{ext}'
-- This table adds the label, job provenance, and energy fraction.
--
-- energy_fraction: what fraction of the parent's total RMS energy this stem carries.
-- For a well-separated 4-stem split this should sum close to 1.0.
-- Low energy_fraction (< 0.02) on an adaptive split → that component was essentially empty.
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.roseglassdb_audio_stems
(
    id               serial NOT NULL,
    job_id           integer NOT NULL,
    parent_audio_id  integer NOT NULL,   -- the loop that was split
    stem_audio_id    integer NOT NULL,   -- the resulting stem (master_audio row)
    stem_label       text NOT NULL,      -- 'drums', 'bass', 'low', 'component_2', etc.
    stem_index       integer NOT NULL,   -- 0-based order within this job
    -- fraction of parent's total energy; NULL until post-split analysis fills it
    energy_fraction  real,
    CONSTRAINT roseglassdb_audio_stems_pkey PRIMARY KEY (id),
    CONSTRAINT ux_ras_job_stem UNIQUE (job_id, stem_index)
);

CREATE INDEX IF NOT EXISTS ix_ras_job     ON public.roseglassdb_audio_stems(job_id);
CREATE INDEX IF NOT EXISTS ix_ras_parent  ON public.roseglassdb_audio_stems(parent_audio_id);
CREATE INDEX IF NOT EXISTS ix_ras_stem    ON public.roseglassdb_audio_stems(stem_audio_id);
CREATE INDEX IF NOT EXISTS ix_ras_label   ON public.roseglassdb_audio_stems(stem_label);

ALTER TABLE IF EXISTS public.roseglassdb_audio_stems
    ADD CONSTRAINT fk_ras_job FOREIGN KEY (job_id)
    REFERENCES public.roseglassdb_stem_split_jobs (id) ON DELETE CASCADE;

ALTER TABLE IF EXISTS public.roseglassdb_audio_stems
    ADD CONSTRAINT fk_ras_parent FOREIGN KEY (parent_audio_id)
    REFERENCES public.roseglassdb_master_audio (id) ON DELETE CASCADE;

ALTER TABLE IF EXISTS public.roseglassdb_audio_stems
    ADD CONSTRAINT fk_ras_stem FOREIGN KEY (stem_audio_id)
    REFERENCES public.roseglassdb_master_audio (id) ON DELETE RESTRICT;

-- ─────────────────────────────────────────────
-- NOTIFY TRIGGER
-- Fires on job completion so downstream workers can auto-analyze stems
-- (run AF-Next captioning, compute embeddings, etc.)
-- ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_notify_stem_split_complete()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.status = 'complete'
       AND (OLD.status IS DISTINCT FROM 'complete')
    THEN
        PERFORM pg_notify(
            'stem_split_complete',
            json_build_object(
                'job_id',          NEW.id,
                'source_audio_id', NEW.source_audio_id,
                'splitter_id',     NEW.splitter_id,
                'stems_produced',  NEW.stems_produced,
                'finished_at',     NEW.finished_at
            )::text
        );
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_stem_split_complete
    AFTER UPDATE ON public.roseglassdb_stem_split_jobs
    FOR EACH ROW EXECUTE FUNCTION public.fn_notify_stem_split_complete();

-- ─────────────────────────────────────────────
-- HELPER: list all stems for a given loop across all splitters
--
-- Usage: SELECT * FROM get_loop_stems(audio_id := 42);
-- ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_loop_stems(p_audio_id integer)
RETURNS TABLE (
    splitter_name   text,
    splitter_method text,
    stem_label      text,
    stem_index      integer,
    energy_fraction real,
    stem_audio_id   integer,
    original_filename text,
    duration_seconds  double precision,
    byte_length       bigint
)
LANGUAGE sql STABLE AS $$
    SELECT
        sp.name,
        sp.method,
        st.stem_label,
        st.stem_index,
        st.energy_fraction,
        st.stem_audio_id,
        a.original_filename,
        a.duration_seconds,
        a.byte_length
    FROM roseglassdb_audio_stems st
    JOIN roseglassdb_stem_split_jobs j  ON j.id  = st.job_id
    JOIN roseglassdb_stem_splitters  sp ON sp.id = j.splitter_id
    JOIN roseglassdb_master_audio    a  ON a.id  = st.stem_audio_id
    WHERE st.parent_audio_id = p_audio_id
      AND j.status = 'complete'
    ORDER BY sp.name, st.stem_index;
$$;

END;
