import { useState, useMemo } from 'react'

export default function VideoFrameScrubber({ frames, fps }) {
  const [cursor, setCursor] = useState(0)
  const current = frames[cursor] ?? frames[0]

  // detect runs of duplicate image_ids (held frames)
  const dedupInfo = useMemo(() => {
    const map = {}
    frames.forEach(f => { map[f.image_id] = (map[f.image_id] ?? 0) + 1 })
    return map
  }, [frames])

  const dupeCount = Object.values(dedupInfo).filter(n => n > 1).length

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-xs text-neutral-500 uppercase tracking-widest">Frame scrubber</h3>

      {/* current frame preview */}
      <div className="aspect-video bg-neutral-800 rounded overflow-hidden border border-neutral-700">
        {current?.thumb_url
          ? <img src={current.thumb_url} alt="" className="w-full h-full object-cover" />
          : <div className="w-full h-full flex items-center justify-center text-neutral-600 text-xs">frame {cursor}</div>
        }
      </div>

      {/* frame info */}
      <div className="grid grid-cols-3 text-xs text-center">
        <div>
          <div className="font-mono text-neutral-200">{cursor}</div>
          <div className="text-neutral-600">index</div>
        </div>
        <div>
          <div className="font-mono text-neutral-200">{current?.pts_ms ?? Math.round((cursor / fps) * 1000)}ms</div>
          <div className="text-neutral-600">pts</div>
        </div>
        <div>
          <div className="font-mono text-accent">{current?.image_id}</div>
          <div className="text-neutral-600">image_id</div>
        </div>
      </div>

      {/* scrub slider */}
      <input
        type="range"
        min={0}
        max={frames.length - 1}
        value={cursor}
        onChange={e => setCursor(Number(e.target.value))}
        className="w-full accent-violet-500"
      />

      {/* frame strip */}
      <div className="flex gap-0.5 overflow-x-auto pb-1">
        {frames.map((f, i) => {
          const isDupe = i > 0 && f.image_id === frames[i - 1]?.image_id
          return (
            <button
              key={i}
              onClick={() => setCursor(i)}
              title={`frame ${f.frame_index} · image_id ${f.image_id}`}
              className={`shrink-0 w-8 aspect-video rounded-sm overflow-hidden border transition-all
                ${i === cursor ? 'border-accent' : isDupe ? 'border-accent/20' : 'border-transparent'}
              `}
            >
              {f.thumb_url
                ? <img src={f.thumb_url} alt="" className="w-full h-full object-cover" />
                : <div className="w-full h-full bg-neutral-800" />
              }
            </button>
          )
        })}
      </div>

      {/* dedup annotation */}
      {dupeCount > 0 && (
        <p className="text-[10px] text-neutral-500 leading-relaxed">
          <span className="text-accent">{dupeCount}</span> image_ids used by multiple frames
          (highlighted). Those frames cost one image row, not N.
        </p>
      )}
    </div>
  )
}
