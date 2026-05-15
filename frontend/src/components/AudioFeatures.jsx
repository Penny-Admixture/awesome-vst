// Renders structured audio_features result_json in a readable way

export default function AudioFeatures({ analysis }) {
  const feat = analysis?.find(a => a.analysis_type === 'audio_features')?.result_json
  if (!feat) return null

  return (
    <div className="rounded border border-neutral-800 p-3 bg-neutral-950">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] bg-accent/10 text-accent px-1.5 py-0.5 rounded uppercase tracking-wide">
          audio features
        </span>
      </div>

      {/* primary stats */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        {feat.bpm != null && <BigStat label="BPM" value={feat.bpm} />}
        {feat.key && <BigStat label="key" value={feat.key} />}
        {feat.time_signature && <BigStat label="time" value={feat.time_signature} />}
      </div>

      {/* bar meters */}
      {[
        { key: 'energy', label: 'energy' },
        { key: 'danceability', label: 'danceability' },
      ].map(({ key, label }) =>
        feat[key] != null ? (
          <div key={key} className="flex items-center gap-2 mb-1.5 text-xs">
            <span className="text-neutral-500 w-20 shrink-0">{label}</span>
            <div className="flex-1 h-1.5 bg-neutral-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-accent/60 rounded-full"
                style={{ width: `${feat[key] * 100}%` }}
              />
            </div>
            <span className="text-neutral-400 w-8 text-right font-mono">{feat[key].toFixed(2)}</span>
          </div>
        ) : null
      )}

      {/* loudness */}
      {feat.loudness_lufs != null && (
        <p className="text-xs text-neutral-500 mt-1">
          loudness <span className="text-neutral-300 font-mono">{feat.loudness_lufs} LUFS</span>
        </p>
      )}

      {/* tag clouds */}
      {feat.mood?.length > 0 && <TagCloud label="mood" tags={feat.mood} />}
      {feat.genre?.length > 0 && <TagCloud label="genre" tags={feat.genre} />}
      {feat.instruments?.length > 0 && <TagCloud label="instruments" tags={feat.instruments} dim />}
    </div>
  )
}

function BigStat({ label, value }) {
  return (
    <div className="text-center">
      <div className="text-accent font-mono text-sm">{value}</div>
      <div className="text-neutral-600 text-[10px]">{label}</div>
    </div>
  )
}

function TagCloud({ label, tags, dim }) {
  return (
    <div className="flex flex-wrap gap-1 mt-2">
      <span className="text-[10px] text-neutral-600 self-center mr-1">{label}</span>
      {tags.map(t => (
        <span
          key={t}
          className={`text-[10px] px-1.5 py-0.5 rounded
            ${dim ? 'bg-neutral-800 text-neutral-500' : 'bg-accent/10 text-accent/80'}`}
        >
          {t}
        </span>
      ))}
    </div>
  )
}
