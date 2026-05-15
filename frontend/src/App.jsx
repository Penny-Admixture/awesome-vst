import { useStore } from './store'
import NavBar from './components/NavBar'
import ImageBrowser from './components/ImageBrowser'
import AudioBrowser from './components/AudioBrowser'
import VideoBrowser from './components/VideoBrowser'
import TransformsBrowser from './components/TransformsBrowser'
import LoopsBrowser from './components/LoopsBrowser'
import DetailPanel from './components/DetailPanel'

export default function App() {
  const { view, selected, setView, clearSelected } = useStore()

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <NavBar view={view} onViewChange={setView} />
      <div className="flex-1 flex overflow-hidden">
        <main className="flex-1 overflow-y-auto">
          {view === 'images'     && <ImageBrowser />}
          {view === 'audio'      && <AudioBrowser />}
          {view === 'video'      && <VideoBrowser />}
          {view === 'transforms' && <TransformsBrowser />}
          {view === 'loops'      && <LoopsBrowser />}
        </main>

        {selected && (
          <DetailPanel
            type={selected.type}
            item={selected.item}
            onClose={clearSelected}
          />
        )}
      </div>
    </div>
  )
}
