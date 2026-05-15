import { useState } from 'react'
import NavBar from './components/NavBar'
import ImageBrowser from './components/ImageBrowser'
import AudioBrowser from './components/AudioBrowser'
import VideoBrowser from './components/VideoBrowser'
import DetailPanel from './components/DetailPanel'

export default function App() {
  const [view, setView] = useState('images')
  const [selected, setSelected] = useState(null) // { type: 'image'|'audio'|'video', item }

  function select(type, item) {
    setSelected(prev =>
      prev?.type === type && prev?.item?.id === item.id ? null : { type, item },
    )
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <NavBar view={view} onViewChange={v => { setView(v); setSelected(null) }} />
      <div className="flex-1 flex overflow-hidden">
        <main className="flex-1 overflow-y-auto">
          {view === 'images' && <ImageBrowser onSelect={item => select('image', item)} selected={selected} />}
          {view === 'audio'  && <AudioBrowser onSelect={item => select('audio', item)} selected={selected} />}
          {view === 'video'  && <VideoBrowser onSelect={item => select('video', item)} selected={selected} />}
        </main>

        {selected && (
          <DetailPanel
            type={selected.type}
            item={selected.item}
            onClose={() => setSelected(null)}
          />
        )}
      </div>
    </div>
  )
}
