// Visual flow diagram of a transform sequence.
// Each step is a node; arrows connect them left → right.
// Upgrade path: swap the CSS layout for React Flow if you need drag/rearrange.

function TransformNode({ step, index, total }) {
  const t = step.transform
  const changedFields = t ? Object.entries({
    brightness: t.brightness, contrast: t.contrast, gamma: t.gamma !== 1.0 ? t.gamma : null,
    red: t.red, green: t.green, blue: t.blue, hue: t.hue, saturation: t.saturation,
    usmsharpen: t.usmsharpen_amount,
  }).filter(([, v]) => v && v !== 0 && v !== null) : []

  return (
    <div className="flex items-center gap-0 shrink-0">
      <div className="rounded border border-neutral-700 bg-neutral-800 p-2.5 w-36 min-h-[72px] flex flex-col gap-1">
        <div className="flex items-start justify-between gap-1">
          <span className="text-[10px] text-neutral-500">step {index}</span>
          <span className="text-[10px] bg-neutral-700 text-neutral-400 px-1 rounded font-mono">
            id {step.transform_id}
          </span>
        </div>
        <p className="text-xs text-neutral-100 leading-tight">
          {t?.name ?? `Transform ${step.transform_id}`}
        </p>
        {changedFields.length > 0 && (
          <div className="flex flex-wrap gap-0.5 mt-auto">
            {changedFields.slice(0, 4).map(([k, v]) => (
              <span key={k} className="text-[9px] bg-neutral-900 text-neutral-500 px-1 py-px rounded font-mono">
                {k} {v > 0 ? '+' : ''}{v}
              </span>
            ))}
          </div>
        )}
        {t?.usage_count != null && (
          <p className="text-[9px] text-neutral-600 mt-auto">used {t.usage_count}×</p>
        )}
      </div>

      {index < total - 1 && (
        <div className="flex items-center shrink-0 text-neutral-600">
          <div className="w-4 h-px bg-neutral-700" />
          <svg width="6" height="8" viewBox="0 0 6 8" fill="currentColor">
            <path d="M0 0L6 4L0 8z" />
          </svg>
        </div>
      )}
    </div>
  )
}

export default function TransformGraph({ sequence }) {
  const { steps = [] } = sequence
  const sorted = [...steps].sort((a, b) => a.step_index - b.step_index)

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs text-neutral-500 uppercase tracking-widest">Step flow</h3>
        <span className="text-[10px] text-neutral-600">{sorted.length} transform{sorted.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="rounded border border-neutral-800 bg-neutral-950 p-3 overflow-x-auto">
        {sorted.length === 0
          ? <p className="text-xs text-neutral-600">No steps defined.</p>
          : (
            <div className="flex items-center gap-0">
              {/* input image slot */}
              <div className="shrink-0 rounded border border-dashed border-neutral-700 bg-neutral-900 px-2 py-1 text-[10px] text-neutral-600 mr-1">
                input
              </div>
              <div className="flex items-center mr-1 text-neutral-700">
                <div className="w-3 h-px bg-neutral-700" />
                <svg width="5" height="7" viewBox="0 0 6 8" fill="currentColor">
                  <path d="M0 0L6 4L0 8z" />
                </svg>
              </div>

              {sorted.map((step, i) => (
                <TransformNode key={step.id} step={step} index={i} total={sorted.length} />
              ))}

              {/* output image slot */}
              <div className="flex items-center ml-1 text-neutral-700">
                <div className="w-3 h-px bg-neutral-700" />
                <svg width="5" height="7" viewBox="0 0 6 8" fill="currentColor">
                  <path d="M0 0L6 4L0 8z" />
                </svg>
              </div>
              <div className="shrink-0 rounded border border-dashed border-accent/40 bg-accent/5 px-2 py-1 text-[10px] text-accent/60">
                result
              </div>
            </div>
          )
        }
      </div>
    </div>
  )
}
