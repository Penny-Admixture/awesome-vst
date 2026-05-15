-- Video + Media Analysis schema additions
-- Extends roseglassdb_master_images / roseglassdb_master_audio

BEGIN;

-- ─────────────────────────────────────────────
-- VIDEO
-- A video = ordered image sequence + optional audio track (same duration).
-- The frame index rows are ~20 bytes each (just integer IDs).
-- sha256 dedup on master_images collapses identical frames automatically,
-- so a static 30fps section costs 1 image row, not N copies.
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.roseglassdb_master_videos
(
    id                    serial NOT NULL,
    original_filename     text,
    title                 text,
    duration_seconds      double precision NOT NULL,
    fps                   double precision NOT NULL,
    width                 integer,
    height                integer,
    frame_count           integer,
    -- NULL audio_id = silent video; when set, audio.duration_seconds must match
    audio_id              integer,
    sha256                text,
    mime                  text,
    byte_length           bigint,
    -- original source file location (if kept); bytes rarely stored inline
    external_path         text,
    tags                  text[],
    meta                  jsonb,
    notes                 text,
    source_video_id       integer,
    created_at            timestamptz DEFAULT CURRENT_TIMESTAMP,
    updated_at            timestamptz DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT roseglassdb_master_videos_pkey PRIMARY KEY (id),
    CONSTRAINT roseglassdb_master_videos_sha256_key UNIQUE (sha256)
);

-- Frame index: just integer pointers into master_images.
-- 30 fps × 60 s = 1 800 rows × ~20 bytes ≈ 36 KB of index per video-minute.
-- Identical frames (held frames, freeze-frames) share one image_id automatically.
CREATE TABLE IF NOT EXISTS public.roseglassdb_video_frames
(
    id           serial NOT NULL,
    video_id     integer NOT NULL,
    frame_index  integer NOT NULL,
    image_id     integer NOT NULL,
    pts_ms       integer,   -- presentation timestamp ms; NULL = derive from frame_index / fps
    CONSTRAINT roseglassdb_video_frames_pkey PRIMARY KEY (id),
    CONSTRAINT ux_rvf_frame UNIQUE (video_id, frame_index)
);

CREATE INDEX IF NOT EXISTS ix_rvf_video  ON public.roseglassdb_video_frames(video_id);
CREATE INDEX IF NOT EXISTS ix_rvf_image  ON public.roseglassdb_video_frames(image_id);

-- ─────────────────────────────────────────────
-- ANALYSIS / CAPTIONING
-- One table covers images, audio, and video.
-- Exactly one of image_id / audio_id / video_id must be non-null.
--
-- analysis_type values:
--   'caption'        – free-text description (vision or audio model)
--   'tags'           – structured label set  (result_json)
--   'transcription'  – speech-to-text        (result_text)
--   'audio_features' – BPM, key, mood …     (result_json)
--   'embedding'      – vector only           (embedding)
--
-- result_json examples:
--   image  → { objects, scene, dominant_colors, style }
--   audio  → { bpm, key, time_signature, energy, danceability, mood, genre, instruments }
--   video  → { scene_changes, dominant_action, avg_brightness }
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.roseglassdb_media_analysis
(
    id             serial NOT NULL,
    image_id       integer,
    audio_id       integer,
    video_id       integer,
    model          text NOT NULL,   -- 'claude-sonnet-4-6', 'whisper-large-v3', 'essentia', …
    analysis_type  text NOT NULL,   -- see above
    result_text    text,            -- captions, transcriptions
    result_json    jsonb,           -- structured features / tag sets
    embedding      vector(1024),    -- semantic / CLIP / audio embedding for cosine search
    created_at     timestamptz DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT roseglassdb_media_analysis_pkey PRIMARY KEY (id),
    CONSTRAINT chk_rma_one_target CHECK (
        (image_id IS NOT NULL)::int
        + (audio_id IS NOT NULL)::int
        + (video_id IS NOT NULL)::int = 1
    )
);

CREATE INDEX IF NOT EXISTS ix_rma_image     ON public.roseglassdb_media_analysis(image_id);
CREATE INDEX IF NOT EXISTS ix_rma_audio     ON public.roseglassdb_media_analysis(audio_id);
CREATE INDEX IF NOT EXISTS ix_rma_video     ON public.roseglassdb_media_analysis(video_id);
CREATE INDEX IF NOT EXISTS ix_rma_type      ON public.roseglassdb_media_analysis(analysis_type);
CREATE INDEX IF NOT EXISTS ix_rma_embedding ON public.roseglassdb_media_analysis
    USING hnsw (embedding vector_cosine_ops);

-- ─────────────────────────────────────────────
-- FOREIGN KEYS
-- ─────────────────────────────────────────────

ALTER TABLE IF EXISTS public.roseglassdb_master_videos
    ADD CONSTRAINT fk_rmv_audio FOREIGN KEY (audio_id)
    REFERENCES public.roseglassdb_master_audio (id)
    ON UPDATE NO ACTION ON DELETE SET NULL;

ALTER TABLE IF EXISTS public.roseglassdb_master_videos
    ADD CONSTRAINT fk_rmv_source FOREIGN KEY (source_video_id)
    REFERENCES public.roseglassdb_master_videos (id)
    ON UPDATE NO ACTION ON DELETE SET NULL;

ALTER TABLE IF EXISTS public.roseglassdb_video_frames
    ADD CONSTRAINT fk_rvf_video FOREIGN KEY (video_id)
    REFERENCES public.roseglassdb_master_videos (id)
    ON UPDATE NO ACTION ON DELETE CASCADE;

ALTER TABLE IF EXISTS public.roseglassdb_video_frames
    ADD CONSTRAINT fk_rvf_image FOREIGN KEY (image_id)
    REFERENCES public.roseglassdb_master_images (id)
    ON UPDATE NO ACTION ON DELETE RESTRICT;

ALTER TABLE IF EXISTS public.roseglassdb_media_analysis
    ADD CONSTRAINT fk_rma_image FOREIGN KEY (image_id)
    REFERENCES public.roseglassdb_master_images (id)
    ON UPDATE NO ACTION ON DELETE CASCADE;

ALTER TABLE IF EXISTS public.roseglassdb_media_analysis
    ADD CONSTRAINT fk_rma_audio FOREIGN KEY (audio_id)
    REFERENCES public.roseglassdb_master_audio (id)
    ON UPDATE NO ACTION ON DELETE CASCADE;

ALTER TABLE IF EXISTS public.roseglassdb_media_analysis
    ADD CONSTRAINT fk_rma_video FOREIGN KEY (video_id)
    REFERENCES public.roseglassdb_master_videos (id)
    ON UPDATE NO ACTION ON DELETE CASCADE;

END;
