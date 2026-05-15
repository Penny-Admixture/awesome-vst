// Mock data mirroring the DB shape.
// Replace with real API calls from src/api/client.js.

// ── Transforms ───────────────────────────────────────────────────────────────

export const mockTransforms = [
  {
    id: 1, name: 'Boost Contrast', usage_count: 47,
    brightness: 0, contrast: 40, gamma: 1.0, red: 0, green: 0, blue: 0,
    hue: 0, saturation: 0, usmsharpen_amount: 0, usmsharpen_radius: 0,
  },
  {
    id: 2, name: 'Warm Grade', usage_count: 31,
    brightness: 10, contrast: 5, gamma: 0.95, red: 22, green: 8, blue: -12,
    hue: 4, saturation: 15, usmsharpen_amount: 0, usmsharpen_radius: 0,
  },
  {
    id: 3, name: 'USM Crisp', usage_count: 58,
    brightness: 0, contrast: 0, gamma: 1.0, red: 0, green: 0, blue: 0,
    hue: 0, saturation: 0, usmsharpen_amount: 90, usmsharpen_radius: 0.5,
  },
  {
    id: 4, name: 'Cool Desaturate', usage_count: 19,
    brightness: -5, contrast: 10, gamma: 1.1, red: -8, green: 0, blue: 18,
    hue: -6, saturation: -30, usmsharpen_amount: 0, usmsharpen_radius: 0,
  },
  {
    id: 5, name: 'Lift Shadows', usage_count: 22,
    brightness: 18, contrast: -8, gamma: 0.85, red: 0, green: 0, blue: 0,
    hue: 0, saturation: 5, usmsharpen_amount: 0, usmsharpen_radius: 0,
  },
]

export const mockSequences = [
  {
    id: 1, name: 'Vintage Film', category_id: 1,
    steps: [
      { id: 1, step_index: 0, transform_id: 5, transform: null },
      { id: 2, step_index: 1, transform_id: 2, transform: null },
      { id: 3, step_index: 2, transform_id: 3, transform: null },
    ],
  },
  {
    id: 2, name: 'Cold Hi-Con', category_id: 1,
    steps: [
      { id: 4, step_index: 0, transform_id: 1, transform: null },
      { id: 5, step_index: 1, transform_id: 4, transform: null },
      { id: 6, step_index: 2, transform_id: 3, transform: null },
    ],
  },
  {
    id: 3, name: 'Neutral Sharpen', category_id: null,
    steps: [
      { id: 7, step_index: 0, transform_id: 3, transform: null },
    ],
  },
]

// Resolve transform refs
mockSequences.forEach(seq => {
  seq.steps.forEach(step => {
    step.transform = mockTransforms.find(t => t.id === step.transform_id) ?? null
  })
})

// ── Audio loops ───────────────────────────────────────────────────────────────

export const mockLoops = [
  {
    id: 1, source_audio_id: 1, loop_number: 1,
    loop_audio_id: 10, offset_ms: 0, offset_musical: 'bar 1',
    duration_seconds: 1.875,
    audio: { id: 10, original_filename: 'hex_loop_01_bar1.flac', duration_seconds: 1.875 },
  },
  {
    id: 2, source_audio_id: 1, loop_number: 2,
    loop_audio_id: 11, offset_ms: 1875, offset_musical: 'bar 2',
    duration_seconds: 1.875,
    audio: { id: 11, original_filename: 'hex_loop_01_bar2.flac', duration_seconds: 1.875 },
  },
  {
    id: 3, source_audio_id: 1, loop_number: 3,
    loop_audio_id: 12, offset_ms: 3750, offset_musical: 'bar 3',
    duration_seconds: 1.875,
    audio: { id: 12, original_filename: 'hex_loop_01_bar3.flac', duration_seconds: 1.875 },
  },
  {
    id: 4, source_audio_id: 1, loop_number: 4,
    loop_audio_id: 13, offset_ms: 5625, offset_musical: 'bar 4',
    duration_seconds: 1.875,
    audio: { id: 13, original_filename: 'hex_loop_01_bar4.flac', duration_seconds: 1.875 },
  },
]

export const mockArrangementTemplates = [
  {
    id: 1, name: 'AABB intro pattern',
    steps: [
      { id: 1, step_index: 0, source_audio_id: 1, loop_number: 1, repeat_count: 2 },
      { id: 2, step_index: 1, source_audio_id: 1, loop_number: 2, repeat_count: 2 },
    ],
  },
  {
    id: 2, name: 'Full 4-bar cycle',
    steps: [
      { id: 3, step_index: 0, source_audio_id: 1, loop_number: 1, repeat_count: 1 },
      { id: 4, step_index: 1, source_audio_id: 1, loop_number: 2, repeat_count: 1 },
      { id: 5, step_index: 2, source_audio_id: 1, loop_number: 3, repeat_count: 1 },
      { id: 6, step_index: 3, source_audio_id: 1, loop_number: 4, repeat_count: 1 },
    ],
  },
]

// ── Images ────────────────────────────────────────────────────────────────────

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
  {
    id: 4,
    original_filename: 'landscape_01_vintage.jpg',
    mime: 'image/jpeg',
    width: 3840,
    height: 2160,
    byte_length: 3_900_000,
    tags: ['landscape', 'processed'],
    thumb_url: 'https://picsum.photos/seed/img4/320/180',
    // provenance: derived from image 1 via sequence 1
    source_image_id: 1,
    produced_by_sequence_id: 1,
    produced_iteration: 1,
    analysis: [
      {
        id: 5,
        model: 'claude-sonnet-4-6',
        analysis_type: 'caption',
        result_text:
          'Warm film-grade version of the mountain sunset. Lifted shadows and added grain give a vintage analogue feel.',
      },
    ],
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

// ── Transform runs ────────────────────────────────────────────────────────────

export const mockRuns = [
  {
    id: 1,
    input_image_id: 1,
    input_image: null, // resolved below
    produced_by_sequence_id: 1,
    sequence_name: 'Vintage Film',
    status: 'complete',
    started_at: '2026-05-14T10:00:00Z',
    finished_at: '2026-05-14T10:00:02.924Z',
    steps: [
      { id: 1, step_index: 0, transform_id: 5, transform_name: 'Lift Shadows',   duration_ms: 423, error_text: null },
      { id: 2, step_index: 1, transform_id: 2, transform_name: 'Warm Grade',      duration_ms: 312, error_text: null },
      { id: 3, step_index: 2, transform_id: 3, transform_name: 'USM Crisp',        duration_ms: 189, error_text: null },
    ],
  },
  {
    id: 2,
    input_image_id: 2,
    input_image: null,
    produced_by_sequence_id: 2,
    sequence_name: 'Cold Hi-Con',
    status: 'error',
    started_at: '2026-05-14T11:30:00Z',
    finished_at: '2026-05-14T11:30:00.541Z',
    steps: [
      { id: 4, step_index: 0, transform_id: 1, transform_name: 'Boost Contrast', duration_ms: 501, error_text: null },
      { id: 5, step_index: 1, transform_id: 4, transform_name: 'Cool Desaturate', duration_ms: null, error_text: 'Out of memory processing 5000×3333 tiff' },
    ],
  },
  {
    id: 3,
    input_image_id: 3,
    input_image: null,
    produced_by_sequence_id: 3,
    sequence_name: 'Neutral Sharpen',
    status: 'complete',
    started_at: '2026-05-14T14:05:00Z',
    finished_at: '2026-05-14T14:05:00.812Z',
    steps: [
      { id: 6, step_index: 0, transform_id: 3, transform_name: 'USM Crisp', duration_ms: 812, error_text: null },
    ],
  },
]

// Resolve input image refs
mockRuns.forEach(run => {
  // mockImages is defined above; lazy reference to avoid circular
  run._resolveImages = (images) => {
    run.input_image = images.find(i => i.id === run.input_image_id) ?? null
  }
})

// ── DSP chains ────────────────────────────────────────────────────────────────

export const mockDSPs = [
  { id: 1, name: 'Parametric EQ',      slug: 'peq',       vendor: 'foo_dsp',   version: '1.4' },
  { id: 2, name: 'Resampler',          slug: 'resampler', vendor: 'foo_dsp',   version: '2.1' },
  { id: 3, name: 'Dynamic Compressor', slug: 'dyn_comp',  vendor: 'foo_dsp',   version: '1.0' },
  { id: 4, name: 'Limiter',            slug: 'limiter',   vendor: 'foo_dsp',   version: '1.2' },
  { id: 5, name: 'Reverb',             slug: 'reverb',    vendor: 'foo_dsp',   version: '3.0' },
]

export const mockDSPSettings = [
  { id: 1, dsp_id: 1, name: 'Flat monitor curve',   params: { bands: [{ freq: 1000, gain: 0 }] } },
  { id: 2, dsp_id: 1, name: 'Loudness boost',       params: { bands: [{ freq: 80, gain: 4 }, { freq: 10000, gain: 3 }] } },
  { id: 3, dsp_id: 3, name: 'Gentle squeeze',       params: { threshold: -18, ratio: 3, attack: 10, release: 100 } },
  { id: 4, dsp_id: 4, name: '-0.1 dBFS ceiling',    params: { ceiling: -0.1 } },
  { id: 5, dsp_id: 5, name: 'Room small',           params: { size: 0.2, decay: 0.4, wet: 0.12 } },
]

// Resolve DSP refs
mockDSPSettings.forEach(s => {
  s.dsp = mockDSPs.find(d => d.id === s.dsp_id) ?? null
})

export const mockDSPSequences = [
  {
    id: 1, name: 'Mastering chain',
    steps: [
      { id: 1, step_index: 0, dsp_settings_id: 2, settings: mockDSPSettings[1], bypass: false, wet_dry: 1.0 },
      { id: 2, step_index: 1, dsp_settings_id: 3, settings: mockDSPSettings[2], bypass: false, wet_dry: 1.0 },
      { id: 3, step_index: 2, dsp_settings_id: 4, settings: mockDSPSettings[3], bypass: false, wet_dry: 1.0 },
    ],
  },
  {
    id: 2, name: 'Monitoring + Room',
    steps: [
      { id: 4, step_index: 0, dsp_settings_id: 1, settings: mockDSPSettings[0], bypass: false, wet_dry: 1.0 },
      { id: 5, step_index: 1, dsp_settings_id: 5, settings: mockDSPSettings[4], bypass: true,  wet_dry: 0.15 },
    ],
  },
]

// ── Stems ─────────────────────────────────────────────────────────────────────

export const mockStemJobs = [
  {
    id: 1,
    source_audio_id: 1,
    source_filename: 'hex_loop_01.flac',
    splitter_name: 'demucs-htdemucs',
    splitter_method: 'ml',
    status: 'complete',
    stems_produced: 4,
    finished_at: '2026-05-15T10:22:00Z',
  },
  {
    id: 2,
    source_audio_id: 1,
    source_filename: 'hex_loop_01.flac',
    splitter_name: 'crossover-4band',
    splitter_method: 'crossover',
    status: 'complete',
    stems_produced: 4,
    finished_at: '2026-05-15T10:23:00Z',
  },
]

export const mockStems = [
  { id: 1,  job_id: 1, stem_label: 'drums',    stem_index: 0, energy_fraction: 0.31, duration_seconds: 3.72, original_filename: 'hex_loop_01_drums.wav' },
  { id: 2,  job_id: 1, stem_label: 'bass',     stem_index: 1, energy_fraction: 0.28, duration_seconds: 3.72, original_filename: 'hex_loop_01_bass.wav' },
  { id: 3,  job_id: 1, stem_label: 'vocals',   stem_index: 2, energy_fraction: 0.04, duration_seconds: 3.72, original_filename: 'hex_loop_01_vocals.wav' },
  { id: 4,  job_id: 1, stem_label: 'other',    stem_index: 3, energy_fraction: 0.37, duration_seconds: 3.72, original_filename: 'hex_loop_01_other.wav' },
  { id: 5,  job_id: 2, stem_label: 'low',      stem_index: 0, energy_fraction: 0.41, duration_seconds: 3.72, original_filename: 'hex_loop_01_low.wav' },
  { id: 6,  job_id: 2, stem_label: 'low_mid',  stem_index: 1, energy_fraction: 0.29, duration_seconds: 3.72, original_filename: 'hex_loop_01_low_mid.wav' },
  { id: 7,  job_id: 2, stem_label: 'high_mid', stem_index: 2, energy_fraction: 0.19, duration_seconds: 3.72, original_filename: 'hex_loop_01_high_mid.wav' },
  { id: 8,  job_id: 2, stem_label: 'high',     stem_index: 3, energy_fraction: 0.11, duration_seconds: 3.72, original_filename: 'hex_loop_01_high.wav' },
]

// ── Sample library ────────────────────────────────────────────────────────────

export const mockSamples = [
  { id: 1,  instrument_family: 'drums',   instrument_category: 'kick',         onset_ms:    0, duration_ms: 480, peak_db: -6.1,  velocity_estimate: 110, original_filename: 'drdre_kick_000000ms.wav',         near_duplicate_of: null },
  { id: 2,  instrument_family: 'drums',   instrument_category: 'snare',        onset_ms:  937, duration_ms: 320, peak_db: -9.4,  velocity_estimate:  98, original_filename: 'drdre_snare_000937ms.wav',        near_duplicate_of: null },
  { id: 3,  instrument_family: 'drums',   instrument_category: 'hihat_closed', onset_ms:  234, duration_ms:  80, peak_db: -14.2, velocity_estimate:  72, original_filename: 'drdre_hihat_closed_000234ms.wav', near_duplicate_of: null },
  { id: 4,  instrument_family: 'drums',   instrument_category: 'hihat_closed', onset_ms:  468, duration_ms:  75, peak_db: -15.8, velocity_estimate:  68, original_filename: 'drdre_hihat_closed_000468ms.wav', near_duplicate_of: 3 },
  { id: 5,  instrument_family: 'drums',   instrument_category: 'kick',         onset_ms: 1875, duration_ms: 460, peak_db: -6.8,  velocity_estimate: 105, original_filename: 'drdre_kick_001875ms.wav',         near_duplicate_of: 1 },
  { id: 6,  instrument_family: 'drums',   instrument_category: 'clap',         onset_ms: 1875, duration_ms: 210, peak_db: -11.0, velocity_estimate:  88, original_filename: 'drdre_clap_001875ms.wav',         near_duplicate_of: null },
  { id: 7,  instrument_family: 'melodic', instrument_category: 'synth_stab',   onset_ms:  500, duration_ms: 650, peak_db: -8.3,  velocity_estimate:  95, original_filename: 'drdre_synth_stab_000500ms.wav',   near_duplicate_of: null },
  { id: 8,  instrument_family: 'bass',    instrument_category: 'bass_note',    onset_ms:    0, duration_ms: 920, peak_db: -7.5,  velocity_estimate: 100, original_filename: 'drdre_bass_note_000000ms.wav',    near_duplicate_of: null },
  { id: 9,  instrument_family: 'fx',      instrument_category: 'impact',       onset_ms: 3750, duration_ms: 800, peak_db: -5.2,  velocity_estimate: 120, original_filename: 'drdre_impact_003750ms.wav',       near_duplicate_of: null },
  { id: 10, instrument_family: 'drums',   instrument_category: 'tom_floor',    onset_ms: 2812, duration_ms: 380, peak_db: -10.1, velocity_estimate:  85, original_filename: 'drdre_tom_floor_002812ms.wav',    near_duplicate_of: null },
]

export const mockKits = [
  {
    id: 1,
    name: 'Auto: drdre_track.wav',
    kit_type: 'drum_kit',
    kit_coherence_score: 0.87,
    members: [
      { role: 'kick',         sample_id: 1,  sample: mockSamples[0] },
      { role: 'snare',        sample_id: 2,  sample: mockSamples[1] },
      { role: 'hihat_closed', sample_id: 3,  sample: mockSamples[2] },
      { role: 'clap',         sample_id: 6,  sample: mockSamples[5] },
      { role: 'tom_floor',    sample_id: 10, sample: mockSamples[9] },
    ],
  },
]
