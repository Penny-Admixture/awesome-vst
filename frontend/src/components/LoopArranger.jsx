// Timeline view for audio loops and arrangement templates.
// Loops shown as segments on a source-audio bar.
// Templates shown as ordered step lanes below.

import { useEffect, useState } from 'react'
import { listLoops, listArrangementTemplates } from '../api/client'
import { mockAudio } from '../data/mock'

const COLORS = [
  'bg-violet-700/60 border-violet-500/40',
  'bg-sky-700/60 border-sky-500/40',
  'bg-emerald-700/60 border-emerald-500/40',
  'bg-amber-700/60 border-amber-500/40',
  'bg-rose-700/60 border-rose-500/40',
]

function color(index) {
  return COLORS[index % COLORS.length]
}

function fmtMs(ms) {
  const s = ms / 1000
  return `${s.toFixed(2)}s`
}

export default function LoopArranger({ sourceAudioId = 1 }) {
  const [loops, setLoops] = useState([])
  const [templates, setTemplates] = useState([])
  const [activeTemplate, setActiveTemplate] = useState(null)

  useEffect(() => {
    listLoops({ sourceAudioId }).then(setLoops)
    listArrangementTemplates().then(t => {
      setTemplates(t)
      setActiveTemplate(t[0] ?? null)
    })
  }, [sourceAudioId])

  const source = mockAudio.find(a => a.id === sourceAudioId)
  const totalMs = source ? source.duration_seconds * 1000 : 10000

  return (
    <div className="flex flex-col gap-5 p-4">
      {/* source audio bar */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs text-neutral-400">
            {source?.original_filename ?? `audio id ${sourceAudioId}`}
          </span>
          <span className="text-xs text-neutral-600">{source?.duration_seconds.toFixed(1)}s</span>
        </div>
        <div className="relative h-10 bg-neutral-800 rounded overflow-hidden">
          {loops.map((loop, i) => {
            const left = (loop.offset_ms / totalMs) * 100
            const width = ((loop.duration_seconds * 1000) / totalMs) * 100
            return (
              <div
                key={loop.id}
                title={`loop ${loop.loop_number} · ${loop.offset_musical} · ${fmtMs(loop.offset_ms)}`}
                className={`absolute top-0 h-full border-r ${color(i)} flex items-center px-1`}
                style={{ left: `${left}%`, width: `${width}%` }}
              >
                <span className="text-[9px] text-white/80 truncate font-mono">
                  {loop.loop_number}
                </span>
              </div>
            )
          })}
          {/* tick marks */}
          {[0.25, 0.5, 0.75].map(p => (
            <div
              key={p}
              className="absolute top-0 h-full w-px bg-neutral-600/40"
              style={{ left: `${p * 100}%` }}
            />
          ))}
        </div>
        <div className="flex justify-between text-[9px] text-neutral-600 mt-0.5">
          <span>0s</span>
          <span>{(source?.duration_seconds / 2).toFixed(1)}s</span>
          <span>{source?.duration_seconds.toFixed(1)}s</span>
        </div>
      </div>

      {/* loop index */}
      <div>
        <h3 className="text-xs text-neutral-500 uppercase tracking-widest mb-2">Loops</h3>
        <div className="flex flex-col gap-1.5">
          {loops.map((loop, i) => (
            <div key={loop.id} className={`flex items-center gap-2 rounded border p-2 text-xs ${color(i)}`}>
              <span className="font-mono text-white/70 w-4">{loop.loop_number}</span>
              <span className="text-white/80 truncate flex-1">{loop.audio?.original_filename}</span>
              <span className="text-white/50 shrink-0">{loop.offset_musical}</span>
              <span className="text-white/40 shrink-0 font-mono">{loop.duration_seconds.toFixed(3)}s</span>
            </div>
          ))}
        </div>
      </div>

      {/* arrangement templates */}
      {templates.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <h3 className="text-xs text-neutral-500 uppercase tracking-widest">Arrangement</h3>
            <div className="flex gap-1">
              {templates.map(t => (
                <button
                  key={t.id}
                  onClick={() => setActiveTemplate(t)}
                  className={`text-[10px] px-2 py-0.5 rounded border transition-colors
                    ${activeTemplate?.id === t.id
                      ? 'border-accent/60 bg-accent/10 text-accent'
                      : 'border-neutral-700 text-neutral-500 hover:text-neutral-300'
                    }`}
                >
                  {t.name}
                </button>
              ))}
            </div>
          </div>

          {activeTemplate && (
            <div className="flex gap-1 overflow-x-auto pb-1">
              {activeTemplate.steps
                .sort((a, b) => a.step_index - b.step_index)
                .map((step, i) => {
                  const loop = loops.find(
                    l => l.source_audio_id === step.source_audio_id && l.loop_number === step.loop_number,
                  )
                  const idx = loops.indexOf(loop)
                  return Array.from({ length: step.repeat_count }, (_, r) => (
                    <div
                      key={`${i}-${r}`}
                      title={`loop ${step.loop_number} × repeat ${r + 1}/${step.repeat_count}`}
                      className={`shrink-0 rounded border px-2 py-1.5 text-[10px] flex flex-col gap-0.5 w-16 ${color(idx)}`}
                    >
                      <span className="font-mono text-white/80">L{step.loop_number}</span>
                      <span className="text-white/40">{step.repeat_count > 1 ? `×${r + 1}` : ''}</span>
                    </div>
                  ))
                })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
