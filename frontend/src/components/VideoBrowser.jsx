import { useEffect, useState } from 'react'
import { listVideos } from '../api/client'
import { useStore } from '../store'

function fmtDuration(s) {
  const m = Math.floor(s / 60)
  const sec = (s % 60).toFixed(1)
  return `${m}:${sec.toString().padStart(4, '0')}`
}

export default function VideoBrowser() {
  const [videos, setVideos] = useState([])
  const { selected, select } = useStore()

  useEffect(() => {
    listVideos().then(setVideos)
  }, [])

  return (
    <div className="p-4 flex flex-col gap-3">
      {videos.map(video => {
        const isSelected = selected?.type === 'video' && selected.item.id === video.id
        const posterFrame = video.frames?.[0]

        return (
          <button
            key={video.id}
            onClick={() => select('video', video)}
            className={`text-left rounded-lg border transition-all overflow-hidden
              ${isSelected
                ? 'border-accent ring-1 ring-accent'
                : 'border-neutral-800 hover:border-neutral-600'
              }`}
          >
            <div className="flex gap-3 p-3 bg-neutral-900">
              {/* poster frame */}
              <div className="w-40 aspect-video shrink-0 bg-neutral-800 rounded overflow-hidden">
                {posterFrame?.thumb_url
                  ? <img src={posterFrame.thumb_url} alt="" className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex items-center justify-center text-neutral-600 text-xs">no frames</div>
                }
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-sm text-neutral-100">
                  {video.title ?? video.original_filename}
                </p>
                <p className="text-xs text-neutral-500 mt-0.5">
                  {video.width}×{video.height} · {video.fps} fps · {fmtDuration(video.duration_seconds)}
                </p>

                {/* frame dedup summary */}
                <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                  <Stat label="total frames" value={video.frame_count} />
                  <Stat label="unique frames" value={video.unique_frame_count ?? video.frame_count} accent />
                  <Stat
                    label="audio"
                    value={video.audio_id ? video.audio?.original_filename ?? `id ${video.audio_id}` : 'silent'}
                    accent={!!video.audio_id}
                  />
                </div>

                {video.tags?.length > 0 && (
                  <div className="flex gap-1 mt-2">
                    {video.tags.map(t => (
                      <span key={t} className="text-[10px] bg-neutral-800 text-neutral-400 px-1.5 py-0.5 rounded">
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* mini frame strip (first N frames) */}
            {video.frames?.length > 0 && (
              <div className="flex gap-0.5 overflow-hidden h-10 bg-neutral-950 border-t border-neutral-800">
                {video.frames.slice(0, 30).map((f, i) => (
                  <div
                    key={i}
                    className="shrink-0 h-full aspect-video bg-neutral-800 overflow-hidden relative"
                    title={`frame ${f.frame_index} · image_id ${f.image_id} · ${f.pts_ms}ms`}
                  >
                    {f.thumb_url && <img src={f.thumb_url} alt="" className="w-full h-full object-cover" />}
                    {/* highlight deduplicated frames */}
                    {i > 0 && f.image_id === video.frames[i - 1]?.image_id && (
                      <div className="absolute inset-0 border border-accent/40" />
                    )}
                  </div>
                ))}
              </div>
            )}
          </button>
        )
      })}
    </div>
  )
}

function Stat({ label, value, accent }) {
  return (
    <div>
      <div className={`font-mono truncate ${accent ? 'text-accent' : 'text-neutral-300'}`}>
        {value}
      </div>
      <div className="text-neutral-600">{label}</div>
    </div>
  )
}
