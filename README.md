# roseglassdb

A PostgreSQL-backed system for tracking **media artifacts and their full provenance** — images, audio, video — through transform pipelines, AI analysis, and perceptual geometry.

**[Try the frontend on StackBlitz →](https://stackblitz.com/github/Penny-Admixture/awesome-vst/tree/main/frontend)**

---

## What it is

Every image, audio file, and video in roseglassdb knows:
- where it came from (`source_image_id`, `source_audio_id`)
- what produced it (`produced_by_sequence_id`, `produced_by_sos_id`, `produced_iteration`)
- what has been said about it (captions, tags, audio features, bounding boxes)
- how it relates perceptually to other artifacts (Riemannian inner products)

Nothing is ever overwritten. Derived artifacts point back to their parents. Runs are immutable records.

---

## Core concepts

### Media atoms
`roseglassdb_master_images` and `roseglassdb_master_audio` are the source of truth. Both store bytes or an external path, sha256 for dedup, full metadata, and self-referential FKs for the derivation chain.

### Video = frame index + audio track
`roseglassdb_master_videos` holds fps/duration/dimensions and an optional `audio_id`. Frames live in `roseglassdb_video_frames` as ordered `(video_id, frame_index, image_id)` rows — about 20 bytes each. Identical frames (held frames, freeze-frames) share one `image_id` via sha256 dedup. A 30fps/60s video costs ~36KB of index, not terabytes.

### Transform pipeline (fsviewer)
`fsviewer_transforms` are atomic color/sharpen operations. `fsviewer_transform_sequences` chain them into named recipes. `fsviewer_sequence_of_sequences` chains sequences together. Every execution is logged in `image_transform_sequence_runs` and `image_transform_sequence_run_steps` with per-step timing, intermediate images, and error text.

### Perceptual geometry
`fsviewer_sequence_riemannian_inner_products` stores pairwise `theta_angle` distances between sequences in a configurable geometry basis (`perceptual`, `color`, `texture`, `audio`). Use `find_perceptual_neighbors(sequence_id)` to query it.

### Audio loops and DSP
`roseglassdb_audio_loops` slices source audio at `offset_ms` into named loops. `roseglassdb_loop_arrangement_templates` sequences those loops with repeat counts. `foobar2000_dsps` / `foobar2000_dsp_settings` / `foobar2000_dsp_settings_sequences` model the DSP processing chain as first-class data.

### AI analysis layer
`roseglassdb_media_analysis` holds captions, tag sets, audio features, and vector embeddings for any image, audio, or video. A `CHECK` constraint ensures exactly one target FK is set. An HNSW index on `embedding vector(1024)` enables cosine similarity queries.

`roseglassdb_analysis_models` is a versioned registry of the models that produced the analysis. `roseglassdb_image_detected_objects` stores bounding-box results. `roseglassdb_audio_segments` stores temporal segmentation (intro/verse/chorus/drop) as queryable rows.

Use `search_media_by_embedding(query_vec, 'audio', 10)` for cross-modal search — find audio closest to an image's CLIP embedding, or images closest to a music description.

### Vector search
`anythingllm_vectors` is the cross-modal semantic brain — 1024-dim embeddings with JSONB metadata, usable for RAG and similarity retrieval across all media types.

---

## Schema

```
db/
  video_and_analysis.sql      — video + media_analysis tables (run first)
  analysis_refinements.sql    — model registry, detected objects, audio segments,
                                SQL helper functions, NOTIFY trigger
  schema.md                   — Mermaid ERDs for all subsystems
```

PostgREST tip: table names map directly to endpoints with no backend code needed.

```
GET /roseglassdb_master_images?tags=cs.{landscape}
GET /fsviewer_transform_sequences?select=*,fsviewer_sequence_steps(*)
```

---

## Frontend

React + Vite + Tailwind. Seven views, all wired to mock data by default — swap `USE_MOCK = false` in `src/api/client.js` and point the Vite proxy at your PostgREST instance.

| Tab | What it shows |
|---|---|
| Images | Thumbnail grid with analysis badges |
| Audio | Track list with waveform, BPM/key/mood callouts |
| Video | Frame dedup stats, mini frame strip, scrubber |
| Transforms | Visual step-flow for each transform sequence |
| Loops | Source audio ruler with loop segments, arrangement lanes |
| Runs | Transform run history with per-step timing and errors |
| DSP | foobar2000 DSP chain flow diagram |

Detail panel shows ProvenanceTree (recursive lineage), AudioFeatures meters, VideoFrameScrubber, and all analysis results for the selected item.

### Run locally

```bash
cd frontend
npm install
npm run dev
```

**[Or open instantly in StackBlitz →](https://stackblitz.com/github/Penny-Admixture/awesome-vst/tree/main/frontend)**

---

## Analysis models

### Image — Qwen3-VL-8B Instruct
Use the **Instruct** variant, not Thinking. Thinking mode adds chain-of-thought which wastes tokens on batch captioning tasks where you want consistent structured output. Instruct handles captions, tag sets, bounding boxes, and dominant colors reliably.

Register once:
```sql
INSERT INTO roseglassdb_analysis_models (name, version, modality)
VALUES ('qwen3-vl-8b-instruct', '8B', 'image');
```

### Audio — hybrid: Essentia + AF-Next Captioner
Two models, two jobs, stored as separate `analysis_type` rows:

| model | analysis_type | what it produces |
|---|---|---|
| `essentia` | `beat_grid` | BPM, beat positions ms[], downbeats ms[], key confidence |
| `essentia` | `audio_features` | key, spectral centroid, danceability, loudness, dynamics |
| `af-next-captioner` | `caption` | free-text "Pitchfork-style" summary |
| `af-next-captioner` | `tags` | genre[], mood[], instruments[], vocals, era |

BPM/key are deterministic facts → Essentia. Genre/mood/instruments are probabilistic opinions → AF-Next (Audio Flamingo Next, NVIDIA/UMD). Keep them separate so you can re-run a better captioner later without touching the MIR outputs.

Music Flamingo (DeepMind) is an alternative for the semantic layer — both fit the schema identically.

---

## Beat slicing / measure extraction

`db/beat_slicing.sql` adds a pipeline for mining a long WAV (track or DJ mix) into loops.

**Flow:**
1. Ingest WAV → `roseglassdb_master_audio`
2. Run Essentia beat tracker → `roseglassdb_media_analysis` with `analysis_type = 'beat_grid'`
   ```json
   { "bpm": 128.5, "beats_ms": [0, 468, 937, ...], "downbeats_ms": [0, 1875, 3750, ...], "beat_confidence": 0.94 }
   ```
3. Pick an extraction config (`roseglassdb_loop_extraction_configs`) — built-in presets:
   - `downbeat_standard` — 1/2/4/8-bar loops on the downbeat
   - `grid_dense` — all four beat offsets as 1-bar loops (finds syncopated entry points)
   - `halfbar_offsets` — downbeat + half-bar offset pairs
   - `phrase_coarse` — 4/8/16/32-bar blocks for DJ mixes
4. Preview before committing: `SELECT * FROM preview_extraction_slices(beat_analysis_id, config_id);`
5. Worker runs, slices audio via ffmpeg → new `roseglassdb_master_audio` rows + `roseglassdb_audio_loops` links
6. LISTEN on `loop_extraction_complete` for next-step automation

Each loop lands in `roseglassdb_audio_loops` with `offset_ms` (exact position) and `offset_musical` (label like `"4bar-phrase"`), queryable with `listLoops({ sourceAudioId })`.

---

## Stack

- PostgreSQL + pgvector
- PostgREST (recommended API layer)
- React 18 + Vite + Tailwind CSS + Zustand
- Essentia (MIR: BPM, beats, key, spectral)
- AF-Next Captioner / Music Flamingo (audio semantic layer)
- Qwen3-VL-8B Instruct (image captioning/tagging)
- HNSW index for embedding similarity
- PostgreSQL LISTEN/NOTIFY for worker automation
