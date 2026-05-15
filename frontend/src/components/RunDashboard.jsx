import { useEffect, useState } from 'react'
import { mockRuns, mockImages } from '../data/mock'

// TODO: replace with real API calls
async function listRuns() {
  mockRuns.forEach(r => r._resolveImages?.(mockImages))
  return mockRuns
}

const STATUS_STYLES = {
  complete: 'bg-emerald-900/40 text-emerald-400 border-emerald-700/40',
  error:    'bg-rose-900/40 text-rose-400 border-rose-700/40',
  running:  'bg-amber-900/40 text-amber-400 border-amber-700/40',
  pending:  'bg-neutral-800 text-neutral-500 border-neutral-700',
}

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function totalDuration(run) {
  if (!run.finished_at || !run.started_at) return null
  const ms = new Date(run.finished_at) - new Date(run.started_at)
  return `${ms}ms`
}

export default function RunDashboard() {
  const [runs, setRuns] = useState([])
  const [expanded, setExpanded] = useState(null)

  useEffect(() => {
    listRuns().then(setRuns)
  }, [])

  return (
    <div className="p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-sm text-neutral-300">Transform run history</h2>
        <span className="text-xs text-neutral-600">{runs.length} run{runs.length !== 1 ? 's' : ''}</span>
      </div>

      {runs.map(run => (
        <div key={run.id} className={`rounded-lg border overflow-hidden ${STATUS_STYLES[run.status] ?? STATUS_STYLES.pending}`}>
          {/* run header */}
          <button
            className="w-full text-left px-3 py-2.5 flex items-center gap-3"
            onClick={() => setExpanded(e => e === run.id ? null : run.id)}
          >
            <span className={`text-[10px] uppercase tracking-widest px-1.5 py-0.5 rounded border font-medium shrink-0 ${STATUS_STYLES[run.status]}`}>
              {run.status}
            </span>

            <div className="flex-1 min-w-0">
              <p className="text-sm text-neutral-200 truncate">
                {run.sequence_name ?? `sequence ${run.produced_by_sequence_id}`}
                <span className="text-neutral-500 ml-2 text-xs">run #{run.id}</span>
              </p>
              <p className="text-xs text-neutral-500 mt-0.5">
                {fmtDate(run.started_at)}
                {totalDuration(run) && <> · <span className="text-neutral-400">{totalDuration(run)}</span></>}
              </p>
            </div>

            {run.input_image?.thumb_url && (
              <img
                src={run.input_image.thumb_url}
                alt=""
                className="w-12 aspect-video object-cover rounded shrink-0 opacity-70"
              />
            )}

            <span className="text-neutral-600 shrink-0 text-xs">{expanded === run.id ? '▲' : '▼'}</span>
          </button>

          {/* step detail */}
          {expanded === run.id && (
            <div className="border-t border-current/20 bg-black/20">
              {run.steps.map(step => (
                <div key={step.id} className="flex items-center gap-3 px-3 py-2 border-b border-current/10 last:border-0 text-xs">
                  <span className="text-neutral-600 w-4 shrink-0 font-mono">{step.step_index}</span>
                  <span className="text-neutral-300 flex-1 truncate">{step.transform_name ?? `transform ${step.transform_id}`}</span>

                  {step.error_text
                    ? <span className="text-rose-400 truncate max-w-[200px]" title={step.error_text}>⚠ {step.error_text}</span>
                    : step.duration_ms != null
                      ? <span className="text-neutral-500 font-mono shrink-0">{step.duration_ms}ms</span>
                      : null
                  }
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
