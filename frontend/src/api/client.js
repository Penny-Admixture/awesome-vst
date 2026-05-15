// API client — all calls proxy to /api (see vite.config.js → http://localhost:8000)
// Falls back to mock data when the server is not running.

import { mockImages, mockAudio, mockVideos } from '../data/mock'

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
