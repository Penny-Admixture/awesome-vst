# Schema: roseglassdb core

Three subsystems share a common media layer. Read bottom-up: raw bytes go in, transforms/loops/DSP happen to them, analysis hangs off the results.

---

## 1 · Core media (the atoms)

```mermaid
erDiagram
    roseglassdb_master_images {
        serial  id PK
        text    original_filename
        text    mime
        bigint  byte_length
        text    sha256 UK
        int     width
        int     height
        jsonb   exif
        bytea   bytes
        text    external_path
        bytea   thumbnail_bytes
        text[]  tags
        int     source_image_id FK
        int     produced_by_sequence_id FK
        int     produced_by_sos_id FK
    }

    roseglassdb_master_audio {
        serial  id PK
        text    original_filename
        text    mime
        bigint  byte_length
        text    sha256 UK
        float8  duration_seconds
        int     sample_rate_hz
        int     channels
        int     bit_depth
        int     bitrate_kbps
        text    codec
        text    container
        jsonb   meta
        bytea   bytes
        text    external_path
        bytea   waveform_bytes
        text[]  tags
        int     source_audio_id FK
    }

    roseglassdb_master_videos {
        serial  id PK
        text    original_filename
        text    title
        float8  duration_seconds
        float8  fps
        int     width
        int     height
        int     frame_count
        int     audio_id FK
        text    sha256 UK
        text    external_path
        text[]  tags
        jsonb   meta
        int     source_video_id FK
    }

    roseglassdb_video_frames {
        serial  id PK
        int     video_id FK
        int     frame_index
        int     image_id FK
        int     pts_ms
    }

    roseglassdb_media_analysis {
        serial  id PK
        int     image_id FK
        int     audio_id FK
        int     video_id FK
        text    model
        text    analysis_type
        text    result_text
        jsonb   result_json
        vector  embedding
    }

    roseglassdb_master_images ||--o{ roseglassdb_master_images : "source_image_id (derived from)"
    roseglassdb_master_audio  ||--o{ roseglassdb_master_audio  : "source_audio_id (derived from)"
    roseglassdb_master_videos ||--o{ roseglassdb_master_videos : "source_video_id (derived from)"

    roseglassdb_master_audio  ||--o| roseglassdb_master_videos : "audio_id (soundtrack)"
    roseglassdb_master_videos ||--o{ roseglassdb_video_frames  : "video_id"
    roseglassdb_master_images ||--o{ roseglassdb_video_frames  : "image_id (frame pointer)"

    roseglassdb_master_images ||--o{ roseglassdb_media_analysis : "image_id"
    roseglassdb_master_audio  ||--o{ roseglassdb_media_analysis : "audio_id"
    roseglassdb_master_videos ||--o{ roseglassdb_media_analysis : "video_id"
```

### Video storage: why it's not 5000× the data

```
roseglassdb_master_videos  (1 row)
  id=7  fps=30  duration=60s  frame_count=1800  audio_id=3
  └─ audio_id → roseglassdb_master_audio id=3 (the soundtrack, stored once)

roseglassdb_video_frames  (1800 rows, ~36 KB total)
  video_id=7  frame_index=0    image_id=1001  pts_ms=0
  video_id=7  frame_index=1    image_id=1002  pts_ms=33
  video_id=7  frame_index=2    image_id=1002  pts_ms=67   ← same image_id! (duplicate frame)
  video_id=7  frame_index=3    image_id=1003  pts_ms=100
  ...

roseglassdb_master_images  (only unique frames stored)
  id=1001  sha256=abc…  bytes=<frame0 pixels>
  id=1002  sha256=def…  bytes=<frame1 pixels>   ← deduped: frames 1 and 2 point here
  id=1003  sha256=ghi…  bytes=<frame3 pixels>
```

Key insight: `roseglassdb_master_images` has `UNIQUE (sha256)`. Identical frames
(held frames, freeze-frames, repeated cuts) map to the same `image_id` in
`roseglassdb_video_frames`. The frame index is just integers — ~20 bytes per row.

---

## 2 · Image transform pipeline

```mermaid
erDiagram
    fsviewer_transforms {
        serial  id PK
        text    name
        int     brightness
        int     contrast
        float8  gamma
        int     red
        int     green
        int     blue
        int     hue
        int     saturation
        int     usmsharpen_amount
        float8  usmsharpen_radius
    }

    fsviewer_transform_sequences {
        serial  id PK
        text    name
        int     category_id FK
        int     extinguishment_number
    }

    fsviewer_sequence_steps {
        serial  id PK
        int     sequence_id FK
        int     transform_id FK
        int     step_index
    }

    fsviewer_sequence_of_sequences {
        serial  id PK
        text    name
    }

    fsviewer_sequence_of_sequence_steps {
        serial  id PK
        int     sos_id FK
        int     sequence_id FK
        int     step_index
    }

    fsviewer_sequence_categories {
        serial  id PK
        text    name
    }

    fsviewer_sequence_riemannian_inner_products {
        serial  id PK
        int     source_sequence_id FK
        int     target_sequence_id FK
        float8  theta_angle
        text    angular_alignment_label
        text    geometry_basis
    }

    image_transform_sequence_runs {
        serial  id PK
        int     input_image_id FK
        int     produced_by_sequence_id FK
        int     produced_by_sos_id FK
        text    status
        tstz    started_at
        tstz    finished_at
    }

    image_transform_sequence_run_steps {
        serial  id PK
        int     run_id FK
        int     step_index
        int     transform_id FK
        int     sequence_id FK
        int     source_image_id FK
        int     result_image_id FK
        int     duration_ms
        jsonb   step_params_override
    }

    fsviewer_sequence_categories ||--o{ fsviewer_transform_sequences : "category_id"
    fsviewer_transforms ||--o{ fsviewer_sequence_steps : "transform_id"
    fsviewer_transform_sequences ||--o{ fsviewer_sequence_steps : "sequence_id"
    fsviewer_transform_sequences ||--o{ fsviewer_sequence_of_sequence_steps : "sequence_id"
    fsviewer_sequence_of_sequences ||--o{ fsviewer_sequence_of_sequence_steps : "sos_id"
    fsviewer_transform_sequences ||--o{ fsviewer_sequence_riemannian_inner_products : "source"
    fsviewer_transform_sequences ||--o{ fsviewer_sequence_riemannian_inner_products : "target"

    roseglassdb_master_images ||--o{ image_transform_sequence_runs : "input_image_id"
    fsviewer_transform_sequences ||--o{ image_transform_sequence_runs : "produced_by_sequence_id"
    image_transform_sequence_runs ||--o{ image_transform_sequence_run_steps : "run_id"
    roseglassdb_master_images ||--o{ image_transform_sequence_run_steps : "source_image_id"
    roseglassdb_master_images ||--o{ image_transform_sequence_run_steps : "result_image_id"
```

A **transform** is a set of color/sharpen params applied to one image.
A **sequence** is an ordered list of transforms (steps).
A **sequence-of-sequences (SoS)** chains sequences together.
A **run** records what actually happened when you applied a sequence to an image — every intermediate result is stored as its own `master_images` row (linked back via `source_image_id`).

---

## 3 · Audio loop system

```mermaid
erDiagram
    roseglassdb_master_audio {
        serial  id PK
        text    original_filename
        float8  duration_seconds
    }

    roseglassdb_audio_loops {
        serial  id PK
        int     source_audio_id FK
        int     loop_number
        int     loop_audio_id FK
        int     offset_ms
        text    offset_musical
    }

    roseglassdb_loop_arrangement_templates {
        serial  id PK
        text    name
    }

    roseglassdb_loop_arrangement_template_steps {
        serial  id PK
        int     template_id FK
        int     source_audio_id FK
        int     loop_number FK
        int     step_index
        int     repeat_count
    }

    roseglassdb_master_audio ||--o{ roseglassdb_audio_loops : "source_audio_id"
    roseglassdb_master_audio ||--|| roseglassdb_audio_loops : "loop_audio_id (the slice)"
    roseglassdb_loop_arrangement_templates ||--o{ roseglassdb_loop_arrangement_template_steps : "template_id"
    roseglassdb_audio_loops ||--o{ roseglassdb_loop_arrangement_template_steps : "(source,loop_number)"
```

An `audio_loop` slices a source audio file at `offset_ms` and stores the resulting
clip as a new `master_audio` row (`loop_audio_id`). An arrangement template
sequences those loops with repeat counts.

---

## 4 · DSP chain (foobar2000)

```mermaid
erDiagram
    foobar2000_dsps {
        serial  id PK
        text    name
        text    slug UK
        text    vendor
        text    version
        text    plugin_guid
        jsonb   param_schema
    }

    foobar2000_dsp_settings {
        serial  id PK
        int     dsp_id FK
        text    name
        jsonb   params
    }

    foobar2000_dsp_settings_sequences {
        serial  id PK
        text    name
    }

    foobar2000_dsp_settings_sequence_steps {
        serial  id PK
        int     sequence_id FK
        int     dsp_settings_id FK
        int     step_index
        bool    bypass
        float8  wet_dry
    }

    foobar2000_dsps ||--o{ foobar2000_dsp_settings : "dsp_id"
    foobar2000_dsp_settings_sequences ||--o{ foobar2000_dsp_settings_sequence_steps : "sequence_id"
    foobar2000_dsp_settings ||--o{ foobar2000_dsp_settings_sequence_steps : "dsp_settings_id"
```

---

## 5 · Analysis: what goes in `result_json`

### Image analysis

```json
{
  "objects":          ["mountain", "sky", "clouds", "treeline"],
  "scene":            "outdoor landscape",
  "dominant_colors":  ["#4a6fa5", "#e8c56d", "#2d3748"],
  "style":            "photorealistic",
  "composition":      "rule of thirds",
  "nsfw_score":       0.01
}
```

### Music / audio analysis

```json
{
  "bpm":              128.5,
  "key":              "F# minor",
  "time_signature":   "4/4",
  "energy":           0.87,
  "danceability":     0.72,
  "loudness_lufs":    -8.3,
  "mood":             ["dark", "energetic", "tense"],
  "genre":            ["electronic", "industrial", "techno"],
  "instruments":      ["synthesizer", "drum machine", "bass"],
  "segments": [
    { "start_ms": 0,     "end_ms": 32000, "label": "intro" },
    { "start_ms": 32000, "end_ms": 96000, "label": "verse" }
  ]
}
```

### Video analysis (whole-clip)

```json
{
  "scene_changes":    [0, 4200, 8100, 11500],
  "dominant_action":  "camera pan left",
  "avg_brightness":   142,
  "has_faces":        false,
  "motion_intensity": 0.34
}
```

---

## 6 · Vector search (`anythingllm_vectors` + `roseglassdb_media_analysis.embedding`)

You have two embedding surfaces:
- `anythingllm_vectors` — generic RAG vectors (content + metadata, not typed to a media entity)
- `roseglassdb_media_analysis.embedding` — typed to image / audio / video, queryable by `analysis_type`

The second one lets you do things like: *"find audio files whose embeddings are closest to this image's CLIP embedding"* by joining `media_analysis` on `image_id` or `audio_id` and using `<=>` cosine distance.

```sql
-- closest audio tracks to image id=42
SELECT a.id, a.original_filename, ia.embedding <=> img_emb.embedding AS dist
FROM roseglassdb_media_analysis img_emb
JOIN roseglassdb_media_analysis ia ON ia.audio_id IS NOT NULL
                                   AND ia.analysis_type = 'embedding'
WHERE img_emb.image_id = 42
  AND img_emb.analysis_type = 'embedding'
ORDER BY dist
LIMIT 10;
```
