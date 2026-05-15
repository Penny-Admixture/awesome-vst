// Mock data mirroring the DB shape.
// Replace with real API calls from src/api/client.js.

export const mockImages = [
  {
    id: 1,
    original_filename: 'landscape_01.jpg',
    mime: 'image/jpeg',
    width: 3840,
    height: 2160,
    byte_length: 4_200_000,
    tags: ['landscape', 'sunset', 'mountains'],
    external_path: null,
    // thumbnail_bytes would be base64-encoded in real usage
    thumb_url: 'https://picsum.photos/seed/img1/320/180',
    analysis: [
      {
        id: 1,
        model: 'claude-sonnet-4-6',
        analysis_type: 'caption',
        result_text:
          'A dramatic sunset over mountainous terrain, with deep violet and amber tones saturating the skyline. Layered ridgelines recede into atmospheric haze.',
      },
      {
        id: 2,
        model: 'claude-sonnet-4-6',
        analysis_type: 'tags',
        result_json: {
          objects: ['mountains', 'sky', 'clouds', 'treeline'],
          scene: 'outdoor landscape',
          dominant_colors: ['#4a6fa5', '#e8c56d', '#2d3748'],
          style: 'photorealistic',
          composition: 'rule of thirds',
        },
      },
    ],
  },
  {
    id: 2,
    original_filename: 'portrait_02.png',
    mime: 'image/png',
    width: 2048,
    height: 2048,
    byte_length: 3_100_000,
    tags: ['portrait', 'studio'],
    thumb_url: 'https://picsum.photos/seed/img2/320/320',
    analysis: [
      {
        id: 3,
        model: 'claude-sonnet-4-6',
        analysis_type: 'caption',
        result_text:
          'High-contrast monochrome portrait with dramatic side lighting. Subject in profile, deep shadow on opposite side.',
      },
    ],
  },
  {
    id: 3,
    original_filename: 'abstract_03.tiff',
    mime: 'image/tiff',
    width: 5000,
    height: 3333,
    byte_length: 49_900_000,
    tags: ['abstract', 'generative'],
    thumb_url: 'https://picsum.photos/seed/img3/320/213',
    analysis: [],
  },
]

export const mockAudio = [
  {
    id: 1,
    original_filename: 'hex_loop_01.flac',
    mime: 'audio/flac',
    duration_seconds: 245.3,
    sample_rate_hz: 44100,
    channels: 2,
    bit_depth: 24,
    bitrate_kbps: 1411,
    codec: 'FLAC',
    byte_length: 43_300_000,
    tags: ['electronic', 'loop', 'dark'],
    analysis: [
      {
        id: 10,
        model: 'essentia',
        analysis_type: 'audio_features',
        result_json: {
          bpm: 128.5,
          key: 'F# minor',
          time_signature: '4/4',
          energy: 0.87,
          danceability: 0.72,
          loudness_lufs: -8.3,
          mood: ['dark', 'energetic', 'tense'],
          genre: ['electronic', 'industrial', 'techno'],
          instruments: ['synthesizer', 'drum machine', 'bass'],
        },
      },
      {
        id: 11,
        model: 'claude-sonnet-4-6',
        analysis_type: 'caption',
        result_text:
          'Industrial techno with pounding 128 BPM kick drum and gritty synthesizer textures. F# minor tonality creates relentless tension. Sparse reverb tail on snare.',
      },
    ],
  },
  {
    id: 2,
    original_filename: 'ambient_drone_02.wav',
    mime: 'audio/wav',
    duration_seconds: 612.0,
    sample_rate_hz: 48000,
    channels: 2,
    bit_depth: 32,
    bitrate_kbps: 3072,
    codec: 'PCM',
    byte_length: 235_000_000,
    tags: ['ambient', 'drone', 'texture'],
    analysis: [
      {
        id: 12,
        model: 'essentia',
        analysis_type: 'audio_features',
        result_json: {
          bpm: null,
          key: 'C major',
          energy: 0.21,
          danceability: 0.04,
          loudness_lufs: -22.1,
          mood: ['calm', 'meditative', 'spacious'],
          genre: ['ambient', 'drone', 'experimental'],
          instruments: ['synthesizer', 'field recording'],
        },
      },
    ],
  },
]

export const mockVideos = [
  {
    id: 1,
    original_filename: 'sequence_clip_01.mp4',
    title: 'Hex sequence – take 3',
    duration_seconds: 12.5,
    fps: 30,
    width: 1920,
    height: 1080,
    frame_count: 375,
    audio_id: 1,
    audio: mockAudio[0],
    tags: ['test', 'sequence'],
    // frame_count unique images (dedup already happened)
    unique_frame_count: 280,
    frames: Array.from({ length: 20 }, (_, i) => ({
      frame_index: i,
      // pretend frame 8-12 are identical (held frame)
      image_id: i >= 8 && i <= 12 ? 104 : 100 + i,
      pts_ms: Math.round((i / 30) * 1000),
      thumb_url: `https://picsum.photos/seed/frame${i >= 8 && i <= 12 ? 108 : 100 + i}/192/108`,
    })),
    analysis: [
      {
        id: 20,
        model: 'claude-sonnet-4-6',
        analysis_type: 'caption',
        result_text:
          'Abstract visual sequence with rhythmic brightness pulses timed to underlying beat. High-contrast frames alternate between near-black and overexposed white.',
      },
    ],
  },
  {
    id: 2,
    original_filename: 'drift_render_07.mp4',
    title: 'Drift render 07 (silent)',
    duration_seconds: 8.0,
    fps: 24,
    width: 3840,
    height: 2160,
    frame_count: 192,
    audio_id: null,
    audio: null,
    tags: ['render', '4k', 'silent'],
    unique_frame_count: 192,
    frames: Array.from({ length: 12 }, (_, i) => ({
      frame_index: i,
      image_id: 200 + i,
      pts_ms: Math.round((i / 24) * 1000),
      thumb_url: `https://picsum.photos/seed/drift${200 + i}/192/108`,
    })),
    analysis: [],
  },
]
