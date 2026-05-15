import { useEffect, useState } from 'react'
import { mockDSPSequences } from '../data/mock'

async function listDSPSequences() { return mockDSPSequences }

function WetDryBar({ value }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-16 h-1 bg-neutral-800 rounded-full overflow-hidden">
        <div className="h-full bg-accent/50 rounded-full" style={{ width: `${(value ?? 1) * 100}%` }} />
      </div>
      <span className="text-[10px] font-mono text-neutral-600">{((value ?? 1) * 100).toFixed(0)}%</span>
    </div>
  )
}

export default function DSPBrowser() {
  const [sequences, setSequences] = useState([])

  useEffect(() => {
    listDSPSequences().then(setSequences)
  }, [])

  return (
    <div className="p-4 flex flex-col gap-4">
      {sequences.map(seq => (
        <div key={seq.id} className="rounded-lg border border-neutral-800 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 bg-neutral-900 border-b border-neutral-800">
            <div>
              <span className="text-sm text-neutral-100">{seq.name}</span>
              <span className="ml-2 text-xs text-neutral-600">id {seq.id}</span>
            </div>
            <span className="text-xs text-neutral-500">{seq.steps.length} plugin{seq.steps.length !== 1 ? 's' : ''}</span>
          </div>

          {/* DSP chain — horizontal flow */}
          <div className="p-3 bg-neutral-950 overflow-x-auto">
            <div className="flex items-center gap-0">
              <PortNode label="in" />

              {seq.steps
                .sort((a, b) => a.step_index - b.step_index)
                .map((step, i, arr) => (
                  <div key={step.id} className="flex items-center">
                    <Arrow />
                    <DSPNode step={step} />
                    {i === arr.length - 1 && <Arrow />}
                  </div>
                ))}

              <PortNode label="out" accent />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function PortNode({ label, accent }) {
  return (
    <div className={`shrink-0 rounded border px-2 py-1 text-[10px]
      ${accent
        ? 'border-dashed border-accent/40 text-accent/60'
        : 'border-dashed border-neutral-700 text-neutral-600'
      }`}
    >
      {label}
    </div>
  )
}

function Arrow() {
  return (
    <div className="flex items-center shrink-0 text-neutral-700">
      <div className="w-3 h-px bg-neutral-700" />
      <svg width="5" height="7" viewBox="0 0 6 8" fill="currentColor"><path d="M0 0L6 4L0 8z" /></svg>
    </div>
  )
}

function DSPNode({ step }) {
  const s = step.settings
  const dsp = s?.dsp

  return (
    <div className={`rounded border bg-neutral-800 p-2 w-36 flex flex-col gap-1 shrink-0
      ${step.bypass ? 'opacity-40 border-neutral-700' : 'border-neutral-600'}`}
    >
      <div className="flex items-start justify-between gap-1">
        <span className="text-[9px] text-neutral-500 truncate">{dsp?.vendor ?? 'plugin'}</span>
        {step.bypass && (
          <span className="text-[9px] text-amber-600 shrink-0">bypass</span>
        )}
      </div>
      <p className="text-xs text-neutral-100 leading-tight">
        {s?.name ?? dsp?.name ?? `settings ${step.dsp_settings_id}`}
      </p>
      {dsp && (
        <p className="text-[9px] text-neutral-600">{dsp.name} v{dsp.version}</p>
      )}
      <WetDryBar value={step.wet_dry} />
    </div>
  )
}
