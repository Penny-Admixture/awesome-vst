// API client — all calls proxy to /api (see vite.config.js → http://localhost:8000)
// Falls back to mock data when the server is not running.
//
// PostgREST tip: if you run PostgREST pointed at your DB, the table names map
// directly to endpoints with zero backend code:
//   GET /roseglassdb_master_images?tags=cs.{landscape}
//   GET /fsviewer_transform_sequences?select=*,fsviewer_sequence_steps(*)
// Update the base URL and remove the /api prefix to use it directly.

import {
  mockImages, mockAudio, mockVideos,
  mockTransforms, mockSequences, mockLoops, mockArrangementTemplates,
} from '../data/mock'

const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true' || true

async function get(path) {
  const res = await fetch(`/api${path}`)
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res.json()
}

// ── Images ──────────────────────────────────────────────────────────────────

export async function listImages({ tags, q } = {}) {
  if (USE_MOCK) return mockImages
  const params = new URLSearchParams()
  if (tags) params.set('tags', tags.join(','))
  if (q) params.set('q', q)
  return get(`/images?${params}`)
}

export async function getImage(id) {
  if (USE_MOCK) return mockImages.find(x => x.id === id)
  return get(`/images/${id}`)
}

// ── Audio ────────────────────────────────────────────────────────────────────

export async function listAudio({ tags } = {}) {
  if (USE_MOCK) return mockAudio
  const params = new URLSearchParams()
  if (tags) params.set('tags', tags.join(','))
  return get(`/audio?${params}`)
}

export async function getAudio(id) {
  if (USE_MOCK) return mockAudio.find(x => x.id === id)
  return get(`/audio/${id}`)
}

// ── Video ────────────────────────────────────────────────────────────────────

export async function listVideos({ tags } = {}) {
  if (USE_MOCK) return mockVideos
  const params = new URLSearchParams()
  if (tags) params.set('tags', tags.join(','))
  return get(`/videos?${params}`)
}

export async function getVideo(id) {
  if (USE_MOCK) return mockVideos.find(x => x.id === id)
  return get(`/videos/${id}`)
}

export async function getVideoFrames(id, { limit = 100, offset = 0 } = {}) {
  if (USE_MOCK) {
    const v = mockVideos.find(x => x.id === id)
    return v?.frames ?? []
  }
  return get(`/videos/${id}/frames?limit=${limit}&offset=${offset}`)
}

// ── Transforms ───────────────────────────────────────────────────────────────

export async function listTransforms() {
  if (USE_MOCK) return mockTransforms
  return get('/fsviewer_transforms')
}

export async function listSequences() {
  if (USE_MOCK) return mockSequences
  return get('/fsviewer_transform_sequences?select=*,fsviewer_sequence_steps(*)')
}

export async function getSequence(id) {
  if (USE_MOCK) return mockSequences.find(s => s.id === id)
  return get(`/fsviewer_transform_sequences/${id}?select=*,fsviewer_sequence_steps(*)`)
}

// ── Loops ─────────────────────────────────────────────────────────────────────

export async function listLoops({ sourceAudioId } = {}) {
  if (USE_MOCK) {
    return sourceAudioId
      ? mockLoops.filter(l => l.source_audio_id === sourceAudioId)
      : mockLoops
  }
  const params = new URLSearchParams()
  if (sourceAudioId) params.set('source_audio_id', `eq.${sourceAudioId}`)
  return get(`/roseglassdb_audio_loops?${params}`)
}

export async function listArrangementTemplates() {
  if (USE_MOCK) return mockArrangementTemplates
  return get('/roseglassdb_loop_arrangement_templates?select=*,roseglassdb_loop_arrangement_template_steps(*)')
}

// ── Analysis ─────────────────────────────────────────────────────────────────

export async function getAnalysis({ imageId, audioId, videoId } = {}) {
  if (USE_MOCK) {
    const all = [...mockImages, ...mockAudio, ...mockVideos]
    const target = all.find(x =>
      (imageId && x.id === imageId) ||
      (audioId && x.id === audioId) ||
      (videoId && x.id === videoId),
    )
    return target?.analysis ?? []
  }
  const params = new URLSearchParams()
  if (imageId) params.set('image_id', imageId)
  if (audioId) params.set('audio_id', audioId)
  if (videoId) params.set('video_id', videoId)
  return get(`/analysis?${params}`)
}
