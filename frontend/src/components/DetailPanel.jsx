import VideoFrameScrubber from './VideoFrameScrubber'
import AudioFeatures from './AudioFeatures'
import ProvenanceTree from './ProvenanceTree'
import TransformGraph from './TransformGraph'

export default function DetailPanel({ type, item, onClose }) {
  return (
    <aside className="w-80 shrink-0 border-l border-neutral-800 bg-neutral-900 flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800">
        <span className="text-xs text-neutral-400 uppercase tracking-widest">{type}</span>
        <button onClick={onClose} className="text-neutral-500 hover:text-neutral-200 text-lg leading-none">×</button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {type === 'image'    && <ImageDetail item={item} />}
        {type === 'audio'    && <AudioDetail item={item} />}
        {type === 'video'    && <VideoDetail item={item} />}
        {type === 'sequence' && <SequenceDetail item={item} />}
      </div>
    </aside>
  )
}

// ── Image ─────────────────────────────────────────────────────────────────────

function ImageDetail({ item }) {
  return (
    <div className="p-4 flex flex-col gap-4">
      {item.thumb_url && (
        <img src={item.thumb_url} alt="" className="w-full rounded border border-neutral-800" />
      )}
      <MetaTable rows={[
        ['filename', item.original_filename],
        ['dimensions', `${item.width} × ${item.height}`],
        ['mime', item.mime],
        ['size', fmtBytes(item.byte_length)],
        ['id', item.id],
      ]} />
      <ProvenanceTree item={item} type="image" />
      <AnalysisList analysis={item.analysis} />
    </div>
  )
}

// ── Audio ─────────────────────────────────────────────────────────────────────

function AudioDetail({ item }) {
  return (
    <div className="p-4 flex flex-col gap-4">
      <MetaTable rows={[
        ['filename', item.original_filename],
        ['duration', fmtDuration(item.duration_seconds)],
        ['codec', `${item.codec} ${item.sample_rate_hz / 1000}kHz`],
        ['channels', item.channels],
        ['bit depth', item.bit_depth],
        ['size', fmtBytes(item.byte_length)],
        ['id', item.id],
      ]} />
      <AudioFeatures analysis={item.analysis} />
      <ProvenanceTree item={item} type="audio" />
      <AnalysisList analysis={item.analysis} skipTypes={['audio_features']} />
    </div>
  )
}

// ── Sequence ──────────────────────────────────────────────────────────────────

function SequenceDetail({ item }) {
  return (
    <div className="p-4 flex flex-col gap-4">
      <MetaTable rows={[
        ['name', item.name],
        ['id', item.id],
        ['category', item.category_id ?? '—'],
        ['steps', item.steps.length],
      ]} />
      <TransformGraph sequence={item} />
    </div>
  )
}

// ── Video ─────────────────────────────────────────────────────────────────────

function VideoDetail({ item }) {
  return (
    <div className="p-4 flex flex-col gap-4">
      <MetaTable rows={[
        ['filename', item.original_filename],
        ['title', item.title],
        ['dimensions', `${item.width} × ${item.height}`],
        ['fps', item.fps],
        ['duration', fmtDuration(item.duration_seconds)],
        ['total frames', item.frame_count],
        ['unique frames', item.unique_frame_count ?? '—'],
        ['audio', item.audio?.original_filename ?? (item.audio_id ? `id ${item.audio_id}` : 'silent')],
        ['id', item.id],
      ]} />

      {/* Frame scrubber — shows the video-as-image-array concept */}
      {item.frames?.length > 0 && <VideoFrameScrubber frames={item.frames} fps={item.fps} />}

      <AnalysisList analysis={item.analysis} />
    </div>
  )
}

// ── Shared ────────────────────────────────────────────────────────────────────

function MetaTable({ rows }) {
  return (
    <table className="w-full text-xs">
      <tbody>
        {rows.filter(([, v]) => v != null).map(([k, v]) => (
          <tr key={k} className="border-b border-neutral-800 last:border-0">
            <td className="py-1.5 pr-3 text-neutral-500 w-24 align-top">{k}</td>
            <td className="py-1.5 text-neutral-200 break-all">{String(v)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function AnalysisList({ analysis, skipTypes = [] }) {
  if (!analysis?.length) return null
  const items = analysis.filter(a => !skipTypes.includes(a.analysis_type))
  if (!items.length) return null

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-xs text-neutral-500 uppercase tracking-widest">Analysis</h3>
      {items.map(a => (
        <div key={a.id} className="rounded border border-neutral-800 p-3 bg-neutral-950">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] bg-accent/10 text-accent px-1.5 py-0.5 rounded uppercase tracking-wide">
              {a.analysis_type}
            </span>
            <span className="text-[10px] text-neutral-600">{a.model}</span>
          </div>

          {a.result_text && (
            <p className="text-xs text-neutral-300 leading-relaxed">{a.result_text}</p>
          )}

          {a.result_json && !a.result_text && (
            <pre className="text-[10px] text-neutral-400 whitespace-pre-wrap break-all leading-relaxed">
              {JSON.stringify(a.result_json, null, 2)}
            </pre>
          )}

          {a.result_json?.dominant_colors && (
            <div className="flex gap-1 mt-2">
              {a.result_json.dominant_colors.map(c => (
                <div key={c} title={c} className="w-5 h-5 rounded" style={{ backgroundColor: c }} />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function fmtBytes(b) {
  if (!b) return '—'
  if (b > 1e6) return `${(b / 1e6).toFixed(1)} MB`
  return `${(b / 1e3).toFixed(0)} KB`
}

function fmtDuration(s) {
  if (!s) return '—'
  const m = Math.floor(s / 60)
  const sec = (s % 60).toFixed(1)
  return `${m}:${sec.toString().padStart(4, '0')}`
}
