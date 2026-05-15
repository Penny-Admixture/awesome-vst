import { useState } from 'react'
import { mockSamples, mockKits } from '../data/mock'

const FAMILIES = ['all', 'drums', 'melodic', 'bass', 'fx', 'vocal']

const FAMILY_COLORS = {
  drums:   'text-orange-400',
  melodic: 'text-violet-400',
  bass:    'text-cyan-400',
  fx:      'text-pink-400',
  vocal:   'text-green-400',
  other:   'text-neutral-400',
}

const CATEGORY_ICONS = {
  kick:         '🥁', snare:        '🥁', hihat_closed: '🎩',
  hihat_open:   '🎩', clap:         '👏', cymbal_crash: '💥',
  tom_floor:    '🥁', tom_mid:      '🥁', tom_high:     '🥁',
  bass_note:    '🎸', synth_stab:   '🎹', piano_note:   '🎹',
  impact:       '💥', riser:        '🚀', fx:           '✨',
  vocal_chop:   '🎤', perc_other:   '🎵',
}

function VelocityBar({ value }) {
  const pct = Math.round((value ?? 0) / 127 * 100)
  return (
    <div className="h-1 rounded-full bg-neutral-700 overflow-hidden w-14">
      <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
    </div>
  )
}

function SampleRow({ sample, isSelected, onClick }) {
  const color   = FAMILY_COLORS[sample.instrument_family] ?? 'text-neutral-400'
  const icon    = CATEGORY_ICONS[sample.instrument_category] ?? '🎵'
  const nearDup = sample.near_duplicate_of != null

  return (
    <div
      onClick={onClick}
      className={`flex items-center gap-3 px-3 py-2 rounded cursor-pointer transition-colors
        ${isSelected ? 'bg-accent/10 border border-accent/30' : 'hover:bg-neutral-800/60 border border-transparent'}`}
    >
      <span className="text-base w-6 text-center">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-medium ${color}`}>{sample.instrument_category}</span>
          {nearDup && (
            <span className="text-xs text-neutral-600" title="Near-duplicate of an existing sample">≈dup</span>
          )}
        </div>
        <div className="text-xs text-neutral-600 truncate">{sample.original_filename}</div>
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        <VelocityBar value={sample.velocity_estimate} />
        <span className="text-xs text-neutral-500 tabular-nums">{sample.duration_ms}ms</span>
      </div>
      <span className="text-xs text-neutral-500 tabular-nums w-14 text-right">
        {sample.peak_db?.toFixed(1)} dBFS
      </span>
    </div>
  )
}

function KitCard({ kit }) {
  const coherencePct = Math.round((kit.kit_coherence_score ?? 0) * 100)
  const barColor = coherencePct > 75 ? 'bg-green-500' : coherencePct > 50 ? 'bg-amber-500' : 'bg-red-500'

  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="text-sm font-medium text-neutral-200">{kit.name}</div>
          <div className="text-xs text-neutral-500 mt-0.5 capitalize">{kit.kit_type.replace('_', ' ')}</div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="text-xs text-neutral-500">coherence</span>
          <div className="flex items-center gap-1.5">
            <div className="h-1.5 w-16 rounded-full bg-neutral-700 overflow-hidden">
              <div className={`h-full rounded-full ${barColor}`} style={{ width: `${coherencePct}%` }} />
            </div>
            <span className="text-xs text-neutral-400 tabular-nums">{coherencePct}%</span>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {kit.members.map(m => (
          <span
            key={m.sample_id}
            className={`text-xs px-2 py-0.5 rounded-full bg-neutral-800 border border-neutral-700 ${FAMILY_COLORS[m.sample?.instrument_family] ?? 'text-neutral-400'}`}
          >
            {m.role ?? m.sample?.instrument_category}
          </span>
        ))}
      </div>
    </div>
  )
}

export default function SamplesView() {
  const [family,   setFamily]   = useState('all')
  const [tab,      setTab]      = useState('library')   // 'library' | 'kits'
  const [selected, setSelected] = useState(null)

  const filtered = family === 'all'
    ? mockSamples
    : mockSamples.filter(s => s.instrument_family === family)

  // Count by category for current family filter
  const categories = {}
  filtered.forEach(s => { categories[s.instrument_category] = (categories[s.instrument_category] ?? 0) + 1 })

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left: filter sidebar */}
      <aside className="w-44 shrink-0 border-r border-neutral-800 p-4 overflow-y-auto">
        <div className="text-xs text-neutral-500 uppercase tracking-wide mb-3">Family</div>
        {FAMILIES.map(f => {
          const count = f === 'all'
            ? mockSamples.length
            : mockSamples.filter(s => s.instrument_family === f).length
          if (count === 0 && f !== 'all') return null
          return (
            <button
              key={f}
              onClick={() => setFamily(f)}
              className={`w-full flex items-center justify-between px-2 py-1.5 rounded text-sm mb-0.5 transition-colors
                ${family === f
                  ? 'bg-accent/20 text-accent'
                  : 'text-neutral-400 hover:text-neutral-200'}`}
            >
              <span className="capitalize">{f}</span>
              <span className="text-xs text-neutral-600">{count}</span>
            </button>
          )
        })}

        {Object.keys(categories).length > 0 && (
          <>
            <div className="text-xs text-neutral-600 uppercase tracking-wide mt-4 mb-2">Category</div>
            {Object.entries(categories)
              .sort((a, b) => b[1] - a[1])
              .map(([cat, count]) => (
                <div key={cat} className="flex items-center justify-between px-2 py-0.5 text-xs text-neutral-500">
                  <span>{cat}</span>
                  <span>{count}</span>
                </div>
              ))}
          </>
        )}
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Tab bar */}
        <div className="flex items-center gap-1 px-4 pt-4 pb-2 border-b border-neutral-800 shrink-0">
          {[['library', 'Library'], ['kits', 'Kits']].map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`px-3 py-1 rounded text-sm font-medium transition-colors
                ${tab === id ? 'bg-accent/20 text-accent' : 'text-neutral-400 hover:text-neutral-200'}`}
            >
              {label}
            </button>
          ))}
          <span className="ml-auto text-xs text-neutral-600">{filtered.length} samples</span>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {tab === 'library' && (
            <div className="flex flex-col gap-0.5">
              {filtered.map(s => (
                <SampleRow
                  key={s.id}
                  sample={s}
                  isSelected={selected === s.id}
                  onClick={() => setSelected(selected === s.id ? null : s.id)}
                />
              ))}
              {filtered.length === 0 && (
                <div className="text-center text-neutral-600 py-16">
                  No {family} samples yet.<br />
                  <code className="text-xs text-neutral-500 mt-2 block">
                    python -m workers.sample_extractor extract --audio-id &lt;id&gt;
                  </code>
                </div>
              )}
            </div>
          )}

          {tab === 'kits' && (
            <div className="flex flex-col gap-3 max-w-xl">
              {mockKits.map(kit => <KitCard key={kit.id} kit={kit} />)}
              {mockKits.length === 0 && (
                <div className="text-center text-neutral-600 py-16">
                  No kits yet — kits are auto-created when you run the sample extractor.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
