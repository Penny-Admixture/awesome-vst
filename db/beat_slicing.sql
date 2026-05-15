-- Beat-based loop extraction pipeline
-- Extends the existing roseglassdb_audio_loops system.
--
-- Flow:
--   1. Ingest source WAV → roseglassdb_master_audio
--   2. Run Essentia beat tracker → roseglassdb_media_analysis (analysis_type='beat_grid')
--      result_json: { bpm, beats_ms, downbeats_ms, time_signature, confidence }
--   3. Apply an extraction config (offset pattern) → roseglassdb_loop_extraction_jobs
--   4. Worker slices audio at each (downbeat + offset) → new roseglassdb_master_audio rows
--   5. Links go in roseglassdb_audio_loops (source_audio_id, loop_audio_id, offset_ms, offset_musical)
--
-- The beat_grid analysis_type reuses the existing roseglassdb_media_analysis table:
--   INSERT INTO roseglassdb_media_analysis (audio_id, model, analysis_type, result_json)
--   VALUES ($audio_id, 'essentia', 'beat_grid', '{
--     "bpm": 128.5,
--     "beats_ms": [0, 468, 937, 1406, ...],
--     "downbeats_ms": [0, 1875, 3750, 5625, ...],
--     "time_signature": "4/4",
--     "beat_confidence": 0.94
--   }');

BEGIN;

-- ─────────────────────────────────────────────
-- LOOP EXTRACTION CONFIGS
-- Defines which offsets to slice at each downbeat.
-- offset_bars: fraction of one bar (0 = downbeat, 0.5 = half-bar, 1.0 = next downbeat, etc.)
-- length_bars: duration of the resulting loop
-- label:       stored in roseglassdb_audio_loops.offset_musical
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.roseglassdb_loop_extraction_configs
(
    id          serial NOT NULL,
    name        text NOT NULL,
    description text,
    -- JSON array of { offset_bars, length_bars, label }
    offsets     jsonb NOT NULL,
    created_at  timestamptz DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT roseglassdb_loop_extraction_configs_pkey PRIMARY KEY (id),
    CONSTRAINT roseglassdb_loop_extraction_configs_name_key UNIQUE (name)
);

-- Built-in presets. Add your own custom offsets as new rows.
INSERT INTO public.roseglassdb_loop_extraction_configs (name, description, offsets) VALUES

-- Downbeats only, multiple lengths — good starting point for any material
('downbeat_standard', 'On-the-downbeat slices in common loop lengths', '[
  {"offset_bars": 0, "length_bars": 1,  "label": "1bar"},
  {"offset_bars": 0, "length_bars": 2,  "label": "2bar"},
  {"offset_bars": 0, "length_bars": 4,  "label": "4bar-phrase"},
  {"offset_bars": 0, "length_bars": 8,  "label": "8bar-section"}
]'),

-- Every beat within the bar as an offset, 1-bar loops — finds syncopated entry points
('grid_dense', 'All four beat offsets within each bar, 1-bar loops', '[
  {"offset_bars": 0,    "length_bars": 1, "label": "beat-1"},
  {"offset_bars": 0.25, "length_bars": 1, "label": "beat-2"},
  {"offset_bars": 0.5,  "length_bars": 1, "label": "beat-3"},
  {"offset_bars": 0.75, "length_bars": 1, "label": "beat-4"}
]'),

-- Half-bar and full-bar offset pairs — useful for DJ mixes where phrases overlap
('halfbar_offsets', 'Downbeat and half-bar offsets, 1- and 2-bar loops', '[
  {"offset_bars": 0,   "length_bars": 1, "label": "1bar-downbeat"},
  {"offset_bars": 0.5, "length_bars": 1, "label": "1bar-half"},
  {"offset_bars": 0,   "length_bars": 2, "label": "2bar-downbeat"},
  {"offset_bars": 0.5, "length_bars": 2, "label": "2bar-half"}
]'),

-- DJ mix / long-form: coarse phrase-level slicing, minimal loops
('phrase_coarse', 'Phrase and section level slices for DJ mixes and long recordings', '[
  {"offset_bars": 0, "length_bars": 4,  "label": "4bar"},
  {"offset_bars": 0, "length_bars": 8,  "label": "8bar"},
  {"offset_bars": 0, "length_bars": 16, "label": "16bar"},
  {"offset_bars": 0, "length_bars": 32, "label": "32bar-block"}
]')

ON CONFLICT (name) DO NOTHING;

-- ─────────────────────────────────────────────
-- LOOP EXTRACTION JOBS
-- Tracks one extraction run: one source audio × one config.
-- After completion, the slices live in roseglassdb_master_audio
-- and are linked via roseglassdb_audio_loops.
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.roseglassdb_loop_extraction_jobs
(
    id                 serial NOT NULL,
    source_audio_id    integer NOT NULL,
    config_id          integer,
    -- FK to the beat_grid analysis that drove the extraction
    beat_analysis_id   integer,
    status             text NOT NULL DEFAULT 'pending', -- pending|running|complete|error
    downbeats_found    integer,
    loops_created      integer DEFAULT 0,
    started_at         timestamptz,
    finished_at        timestamptz,
    error_text         text,
    notes              text,
    created_at         timestamptz DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT roseglassdb_loop_extraction_jobs_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS ix_rlej_source  ON public.roseglassdb_loop_extraction_jobs(source_audio_id);
CREATE INDEX IF NOT EXISTS ix_rlej_status  ON public.roseglassdb_loop_extraction_jobs(status);

ALTER TABLE IF EXISTS public.roseglassdb_loop_extraction_jobs
    ADD CONSTRAINT fk_rlej_source FOREIGN KEY (source_audio_id)
    REFERENCES public.roseglassdb_master_audio (id)
    ON DELETE CASCADE;

ALTER TABLE IF EXISTS public.roseglassdb_loop_extraction_jobs
    ADD CONSTRAINT fk_rlej_config FOREIGN KEY (config_id)
    REFERENCES public.roseglassdb_loop_extraction_configs (id)
    ON DELETE SET NULL;

ALTER TABLE IF EXISTS public.roseglassdb_loop_extraction_jobs
    ADD CONSTRAINT fk_rlej_analysis FOREIGN KEY (beat_analysis_id)
    REFERENCES public.roseglassdb_media_analysis (id)
    ON DELETE SET NULL;

-- ─────────────────────────────────────────────
-- NOTIFY TRIGGER
-- Fires when a loop extraction job completes.
-- Workers that do the actual ffmpeg slicing listen on 'loop_extraction_complete'.
-- ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_notify_loop_extraction_complete()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.status = 'complete'
       AND (OLD.status IS DISTINCT FROM 'complete')
    THEN
        PERFORM pg_notify(
            'loop_extraction_complete',
            json_build_object(
                'job_id',          NEW.id,
                'source_audio_id', NEW.source_audio_id,
                'loops_created',   NEW.loops_created,
                'finished_at',     NEW.finished_at
            )::text
        );
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_loop_extraction_complete
    AFTER UPDATE ON public.roseglassdb_loop_extraction_jobs
    FOR EACH ROW EXECUTE FUNCTION public.fn_notify_loop_extraction_complete();

-- ─────────────────────────────────────────────
-- HELPER: preview what slices a config would produce for a given beat grid
--
-- Usage:
--   SELECT * FROM preview_extraction_slices(beat_analysis_id := 7, config_id := 1);
--
-- Returns one row per (downbeat × offset entry) before any slicing happens.
-- Use this to sanity-check the loop count before committing a job.
-- ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.preview_extraction_slices(
    p_beat_analysis_id integer,
    p_config_id        integer
)
RETURNS TABLE (
    downbeat_index  integer,
    downbeat_ms     integer,
    offset_bars     double precision,
    length_bars     double precision,
    label           text,
    start_ms        integer,
    end_ms          integer,
    duration_ms     integer
)
LANGUAGE plpgsql STABLE AS $$
DECLARE
    v_bpm         double precision;
    v_downbeats   integer[];
    v_offsets     jsonb;
    v_bar_ms      double precision;
    v_db_ms       integer;
    v_offset      jsonb;
    v_i           integer := 0;
BEGIN
    -- pull bpm + downbeats from the beat_grid analysis
    SELECT
        (result_json->>'bpm')::double precision,
        ARRAY(SELECT jsonb_array_elements_text(result_json->'downbeats_ms')::integer)
    INTO v_bpm, v_downbeats
    FROM roseglassdb_media_analysis
    WHERE id = p_beat_analysis_id AND analysis_type = 'beat_grid';

    IF v_bpm IS NULL THEN
        RAISE EXCEPTION 'analysis_id % is not a beat_grid result', p_beat_analysis_id;
    END IF;

    -- ms per bar (4/4 assumed; adjust if time_signature != 4/4)
    v_bar_ms := (60000.0 / v_bpm) * 4;

    -- pull offsets from config
    SELECT offsets INTO v_offsets
    FROM roseglassdb_loop_extraction_configs
    WHERE id = p_config_id;

    -- cross: each downbeat × each offset entry
    FOREACH v_db_ms IN ARRAY v_downbeats LOOP
        FOR v_offset IN SELECT * FROM jsonb_array_elements(v_offsets) LOOP
            downbeat_index := v_i;
            downbeat_ms    := v_db_ms;
            offset_bars    := (v_offset->>'offset_bars')::double precision;
            length_bars    := (v_offset->>'length_bars')::double precision;
            label          := v_offset->>'label';
            start_ms       := v_db_ms + (offset_bars  * v_bar_ms)::integer;
            end_ms         := start_ms + (length_bars * v_bar_ms)::integer;
            duration_ms    := end_ms - start_ms;
            RETURN NEXT;
        END LOOP;
        v_i := v_i + 1;
    END LOOP;
END;
$$;

END;
