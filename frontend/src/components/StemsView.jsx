import { useState } from 'react'
import { useStore } from '../store'
import { mockStemJobs, mockStems } from '../data/mock'

const METHOD_COLORS = {
  ml:        'text-violet-400',
  crossover: 'text-cyan-400',
  nmf:       'text-amber-400',
  ica:       'text-pink-400',
}

const ENERGY_BAR_W = 120   // px

function EnergyBar({ fraction }) {
  const pct = Math.min(100, Math.round((fraction ?? 0) * 100))
  const color = pct > 30 ? 'bg-accent' : pct > 10 ? 'bg-amber-500' : 'bg-neutral-600'
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 rounded-full bg-neutral-700 overflow-hidden" style={{ width: ENERGY_BAR_W }}>
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-neutral-400 tabular-nums w-8">{pct}%</span>
    </div>
  )
}

function StemRow({ stem }) {
  return (
    <div className="flex items-center gap-4 px-4 py-2 hover:bg-neutral-800/50 rounded">
      <span className="w-24 text-sm font-mono text-neutral-100 truncate">{stem.stem_label}</span>
      <EnergyBar fraction={stem.energy_fraction} />
      <span className="text-xs text-neutral-500 tabular-nums w-16">
        {stem.duration_seconds?.toFixed(2)}s
      </span>
      <span className="text-xs text-neutral-600 truncate flex-1">{stem.original_filename}</span>
    </div>
  )
}

function JobCard({ job, stems, isSelected, onSelect }) {
  const methodColor = METHOD_COLORS[job.splitter_method] ?? 'text-neutral-400'
  const jobStems = stems.filter(s => s.job_id === job.id)

  return (
    <div
      className={`rounded-lg border cursor-pointer transition-colors
        ${isSelected
          ? 'border-accent/50 bg-neutral-800'
          : 'border-neutral-800 bg-neutral-900 hover:border-neutral-700'}`}
      onClick={onSelect}
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-sm font-medium ${methodColor}`}>{job.splitter_name}</span>
            <span className="text-xs text-neutral-600 uppercase tracking-wide">{job.splitter_method}</span>
          </div>
          <div className="text-xs text-neutral-500 mt-0.5">{job.source_filename}</div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-sm text-neutral-300">{job.stems_produced} stems</div>
          <div className={`text-xs mt-0.5 ${job.status === 'complete' ? 'text-green-500' : 'text-amber-500'}`}>
            {job.status}
          </div>
        </div>
      </div>

      {isSelected && jobStems.length > 0 && (
        <div className="border-t border-neutral-800 py-2">
          {jobStems.map(s => <StemRow key={s.id} stem={s} />)}
        </div>
      )}
    </div>
  )
}

export default function StemsView() {
  const [selectedJob, setSelectedJob] = useState(mockStemJobs[0]?.id ?? null)

  // Group jobs by source audio
  const bySource = {}
  mockStemJobs.forEach(j => {
    if (!bySource[j.source_filename]) bySource[j.source_filename] = []
    bySource[j.source_filename].push(j)
  })

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-neutral-100">Stems</h2>
        <span className="text-xs text-neutral-500">{mockStemJobs.length} split jobs</span>
      </div>

      {Object.entries(bySource).map(([filename, jobs]) => (
        <div key={filename} className="mb-6">
          <div className="text-xs text-neutral-500 uppercase tracking-wide mb-2 px-1">
            {filename}
          </div>
          <div className="flex flex-col gap-2">
            {jobs.map(job => (
              <JobCard
                key={job.id}
                job={job}
                stems={mockStems}
                isSelected={selectedJob === job.id}
                onSelect={() => setSelectedJob(selectedJob === job.id ? null : job.id)}
              />
            ))}
          </div>
        </div>
      ))}

      {mockStemJobs.length === 0 && (
        <div className="text-center text-neutral-600 py-20">
          No stem jobs yet. Run:<br />
          <code className="text-xs text-neutral-500 mt-2 block">
            python -m workers.stem_splitter queue --audio-id &lt;id&gt;
          </code>
        </div>
      )}
    </div>
  )
}
