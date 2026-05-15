-- Schema refinements from multi-model analysis review
-- Additive only — does not modify existing tables beyond adding a nullable column.
-- Run after video_and_analysis.sql

BEGIN;

-- ─────────────────────────────────────────────
-- MODEL REGISTRY
-- Replaces free-text model column with a versioned, FK-able registry.
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.roseglassdb_analysis_models
(
    id          serial NOT NULL,
    name        text NOT NULL,      -- 'claude-sonnet-4-6', 'blip2', 'musicnn', 'clap'
    version     text,
    modality    text,               -- 'image', 'audio', 'video', 'multimodal'
    description text,
    config      jsonb,              -- API URL, context window, endpoint params, etc.
    created_at  timestamptz DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT roseglassdb_analysis_models_pkey PRIMARY KEY (id),
    CONSTRAINT roseglassdb_analysis_models_name_version_key UNIQUE (name, version)
);

-- Backfillable: model_id nullable so existing rows stay valid.
-- Populate: INSERT INTO roseglassdb_analysis_models(name) SELECT DISTINCT model FROM roseglassdb_media_analysis;
-- Then: UPDATE roseglassdb_media_analysis a SET model_id = m.id FROM roseglassdb_analysis_models m WHERE a.model = m.name;
ALTER TABLE IF EXISTS public.roseglassdb_media_analysis
    ADD COLUMN IF NOT EXISTS model_id integer;

ALTER TABLE IF EXISTS public.roseglassdb_media_analysis
    ADD CONSTRAINT fk_rma_model FOREIGN KEY (model_id)
    REFERENCES public.roseglassdb_analysis_models (id)
    ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ix_rma_model ON public.roseglassdb_media_analysis(model_id);

-- ─────────────────────────────────────────────
-- IMAGE DETECTED OBJECTS
-- Bounding-box level results from object detection / vision models.
-- Structured differently from tags in result_json — queryable per label/confidence.
-- analysis_id → roseglassdb_media_analysis where image_id IS NOT NULL
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.roseglassdb_image_detected_objects
(
    id           serial NOT NULL,
    analysis_id  integer NOT NULL,
    label        text NOT NULL,
    confidence   real,
    -- normalized 0–1 fractions of image dimensions
    bbox         jsonb,   -- {"x": 0.1, "y": 0.2, "w": 0.3, "h": 0.4}
    attributes   jsonb,   -- {"color": "blue", "occluded": false, "pose": "frontal"}
    CONSTRAINT roseglassdb_image_detected_objects_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS ix_rido_analysis ON public.roseglassdb_image_detected_objects(analysis_id);
CREATE INDEX IF NOT EXISTS ix_rido_label    ON public.roseglassdb_image_detected_objects(label);

ALTER TABLE IF EXISTS public.roseglassdb_image_detected_objects
    ADD CONSTRAINT fk_rido_analysis FOREIGN KEY (analysis_id)
    REFERENCES public.roseglassdb_media_analysis (id)
    ON DELETE CASCADE;

-- ─────────────────────────────────────────────
-- AUDIO SEGMENTS
-- Temporal segmentation of audio (intro / verse / chorus / drop / outro).
-- Distinct from audio_features in result_json — each row is queryable by label and time.
-- analysis_id → roseglassdb_media_analysis where audio_id IS NOT NULL
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.roseglassdb_audio_segments
(
    id             serial NOT NULL,
    analysis_id    integer NOT NULL,
    segment_index  integer NOT NULL,
    label          text NOT NULL,       -- 'intro', 'verse', 'chorus', 'bridge', 'drop', 'outro', 'break'
    start_ms       integer NOT NULL,
    end_ms         integer NOT NULL,
    confidence     real,
    attributes     jsonb,               -- {"energy": 0.9, "tempo_bpm": 128, "key": "F# minor"}
    CONSTRAINT roseglassdb_audio_segments_pkey PRIMARY KEY (id),
    CONSTRAINT ux_ras_segment UNIQUE (analysis_id, segment_index),
    CONSTRAINT chk_ras_times CHECK (end_ms > start_ms)
);

CREATE INDEX IF NOT EXISTS ix_ras_analysis ON public.roseglassdb_audio_segments(analysis_id);
CREATE INDEX IF NOT EXISTS ix_ras_label    ON public.roseglassdb_audio_segments(label);

ALTER TABLE IF EXISTS public.roseglassdb_audio_segments
    ADD CONSTRAINT fk_ras_analysis FOREIGN KEY (analysis_id)
    REFERENCES public.roseglassdb_media_analysis (id)
    ON DELETE CASCADE;

-- ─────────────────────────────────────────────
-- HELPER FUNCTIONS
-- ─────────────────────────────────────────────

-- Cross-modal semantic search by embedding.
-- Usage: SELECT * FROM search_media_by_embedding(my_vec, 'audio', 5);
CREATE OR REPLACE FUNCTION public.search_media_by_embedding(
    p_query_embedding vector(1024),
    p_media_type      text    DEFAULT NULL,   -- 'image' | 'audio' | 'video' | NULL = all
    p_max_results     integer DEFAULT 10
)
RETURNS TABLE (
    analysis_id    integer,
    media_type     text,
    image_id       integer,
    audio_id       integer,
    video_id       integer,
    analysis_type  text,
    model          text,
    similarity     real
)
LANGUAGE sql STABLE AS $$
    SELECT
        id,
        CASE
            WHEN image_id IS NOT NULL THEN 'image'
            WHEN audio_id IS NOT NULL THEN 'audio'
            ELSE 'video'
        END,
        image_id, audio_id, video_id,
        analysis_type,
        model,
        (1.0 - (embedding <=> p_query_embedding))::real AS similarity
    FROM public.roseglassdb_media_analysis
    WHERE embedding IS NOT NULL
      AND (
          p_media_type IS NULL
          OR (p_media_type = 'image' AND image_id IS NOT NULL)
          OR (p_media_type = 'audio' AND audio_id IS NOT NULL)
          OR (p_media_type = 'video' AND video_id IS NOT NULL)
      )
    ORDER BY embedding <=> p_query_embedding
    LIMIT p_max_results;
$$;

-- Query the Riemannian inner product table for perceptually similar sequences.
-- Returns neighbors ordered by angular distance (smallest theta = most similar).
-- Usage: SELECT * FROM find_perceptual_neighbors(42, 5);
CREATE OR REPLACE FUNCTION public.find_perceptual_neighbors(
    p_sequence_id integer,
    p_max_results integer DEFAULT 10
)
RETURNS TABLE (
    neighbor_id             integer,
    theta_angle             double precision,
    angular_alignment_label text,
    geometry_basis          text
)
LANGUAGE sql STABLE AS $$
    SELECT
        CASE
            WHEN r.source_sequence_id = p_sequence_id THEN r.target_sequence_id
            ELSE r.source_sequence_id
        END AS neighbor_id,
        r.theta_angle,
        r.angular_alignment_label,
        r.geometry_basis
    FROM public.fsviewer_sequence_riemannian_inner_products r
    WHERE r.source_sequence_id = p_sequence_id
       OR r.target_sequence_id = p_sequence_id
    ORDER BY r.theta_angle
    LIMIT p_max_results;
$$;

-- ─────────────────────────────────────────────
-- NOTIFY TRIGGER
-- Fires when a transform run transitions to 'complete'.
-- Workers listen on channel 'transform_run_complete' and auto-analyze the result image.
-- LISTEN transform_run_complete;  →  triggers captioning worker
-- ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_notify_transform_run_complete()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.status = 'complete'
       AND (OLD.status IS DISTINCT FROM 'complete')
    THEN
        PERFORM pg_notify(
            'transform_run_complete',
            json_build_object(
                'run_id',              NEW.id,
                'input_image_id',      NEW.input_image_id,
                'sequence_id',         NEW.produced_by_sequence_id,
                'sos_id',              NEW.produced_by_sos_id,
                'finished_at',         NEW.finished_at
            )::text
        );
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_transform_run_complete
    AFTER UPDATE ON public.image_transform_sequence_runs
    FOR EACH ROW EXECUTE FUNCTION public.fn_notify_transform_run_complete();

-- ─────────────────────────────────────────────
-- CONVENIENCE VIEWS
-- ─────────────────────────────────────────────

CREATE OR REPLACE VIEW public.v_images_with_latest_caption AS
    SELECT
        i.*,
        c.result_text   AS caption,
        c.model         AS caption_model,
        c.created_at    AS captioned_at
    FROM public.roseglassdb_master_images i
    LEFT JOIN LATERAL (
        SELECT result_text, model, created_at
        FROM public.roseglassdb_media_analysis
        WHERE image_id = i.id AND analysis_type = 'caption'
        ORDER BY created_at DESC
        LIMIT 1
    ) c ON true;

CREATE OR REPLACE VIEW public.v_audio_with_latest_analysis AS
    SELECT
        a.*,
        f.result_json   AS audio_features,
        f.model         AS features_model,
        c.result_text   AS caption,
        c.model         AS caption_model
    FROM public.roseglassdb_master_audio a
    LEFT JOIN LATERAL (
        SELECT result_json, model
        FROM public.roseglassdb_media_analysis
        WHERE audio_id = a.id AND analysis_type = 'audio_features'
        ORDER BY created_at DESC
        LIMIT 1
    ) f ON true
    LEFT JOIN LATERAL (
        SELECT result_text, model
        FROM public.roseglassdb_media_analysis
        WHERE audio_id = a.id AND analysis_type = 'caption'
        ORDER BY created_at DESC
        LIMIT 1
    ) c ON true;

END;
