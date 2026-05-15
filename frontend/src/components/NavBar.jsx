const VIEWS = [
  { id: 'images', label: 'Images' },
  { id: 'audio',  label: 'Audio' },
  { id: 'video',  label: 'Video' },
]

export default function NavBar({ view, onViewChange }) {
  return (
    <header className="flex items-center gap-6 px-5 h-12 bg-neutral-900 border-b border-neutral-800 shrink-0">
      <span className="text-accent font-semibold tracking-wide text-sm">roseglassdb</span>
      <nav className="flex gap-1">
        {VIEWS.map(v => (
          <button
            key={v.id}
            onClick={() => onViewChange(v.id)}
            className={`px-3 py-1 rounded text-sm font-medium transition-colors
              ${view === v.id
                ? 'bg-accent/20 text-accent'
                : 'text-neutral-400 hover:text-neutral-100'
              }`}
          >
            {v.label}
          </button>
        ))}
      </nav>
    </header>
  )
}
