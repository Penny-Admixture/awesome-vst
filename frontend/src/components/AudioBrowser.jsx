import { useEffect, useState } from 'react'
import { listAudio } from '../api/client'

function fmtDuration(s) {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

function fmtBytes(b) {
  if (b > 1e6) return `${(b / 1e6).toFixed(1)} MB`
  return `${(b / 1e3).toFixed(0)} KB`
}

function AudioWaveformPlaceholder() {
  // Decorative fake waveform bars
  return (
    <div className="flex items-center gap-px h-8">
      {Array.from({ length: 40 }, (_, i) => (
        <div
          key={i}
          className="w-1 bg-accent/30 rounded-full"
          style={{ height: `${20 + Math.sin(i * 0.7) * 14 + Math.random() * 8}%` }}
        />
      ))}
    </div>
  )
}

export default function AudioBrowser({ onSelect, selected }) {
  const [tracks, setTracks] = useState([])

  useEffect(() => {
    listAudio().then(setTracks)
  }, [])

  return (
    <div className="p-4 flex flex-col gap-2">
      {tracks.map(track => {
        const isSelected = selected?.type === 'audio' && selected.item.id === track.id
        const features = track.analysis?.find(a => a.analysis_type === 'audio_features')?.result_json

        return (
          <button
            key={track.id}
            onClick={() => onSelect(track)}
            className={`text-left p-3 rounded-lg border transition-all
              ${isSelected
                ? 'border-accent ring-1 ring-accent bg-accent/5'
                : 'border-neutral-800 hover:border-neutral-600 bg-neutral-900'
              }`}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm text-neutral-100 truncate">{track.original_filename}</p>
                <p className="text-xs text-neutral-500 mt-0.5">
                  {fmtDuration(track.duration_seconds)} · {track.codec} {track.sample_rate_hz / 1000}kHz / {track.bit_depth}bit · {fmtBytes(track.byte_length)}
                </p>
              </div>
              {features && (
                <div className="flex gap-3 shrink-0 text-xs text-right">
                  {features.bpm && (
                    <div>
                      <div className="text-accent font-mono">{features.bpm}</div>
                      <div className="text-neutral-500">BPM</div>
                    </div>
                  )}
                  <div>
                    <div className="text-accent font-mono">{features.key ?? '—'}</div>
                    <div className="text-neutral-500">key</div>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-2">
              <AudioWaveformPlaceholder />
            </div>

            <div className="flex flex-wrap gap-1.5 mt-2">
              {track.tags?.map(t => (
                <span key={t} className="text-[10px] bg-neutral-800 text-neutral-400 px-1.5 py-0.5 rounded">
                  {t}
                </span>
              ))}
              {features?.mood?.map(m => (
                <span key={m} className="text-[10px] bg-accent/10 text-accent/80 px-1.5 py-0.5 rounded">
                  {m}
                </span>
              ))}
            </div>
          </button>
        )
      })}
    </div>
  )
}
