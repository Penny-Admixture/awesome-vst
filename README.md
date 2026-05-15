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

## Stack

- PostgreSQL + pgvector
- PostgREST (recommended API layer)
- React 18 + Vite + Tailwind CSS + Zustand
- HNSW index for embedding similarity
- PostgreSQL LISTEN/NOTIFY for auto-analysis worker pattern
