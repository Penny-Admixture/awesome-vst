import { useEffect, useState } from 'react'
import { listImages } from '../api/client'
import { useStore } from '../store'

function fmt(bytes) {
  if (bytes > 1e6) return `${(bytes / 1e6).toFixed(1)} MB`
  return `${(bytes / 1e3).toFixed(0)} KB`
}

export default function ImageBrowser() {
  const [images, setImages] = useState([])
  const { selected, select } = useStore()

  useEffect(() => {
    listImages().then(setImages)
  }, [])

  return (
    <div className="p-4">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
        {images.map(img => {
          const isSelected = selected?.type === 'image' && selected.item.id === img.id
          return (
            <button
              key={img.id}
              onClick={() => select('image', img)}
              className={`group text-left rounded-lg overflow-hidden border transition-all
                ${isSelected
                  ? 'border-accent ring-1 ring-accent'
                  : 'border-neutral-800 hover:border-neutral-600'
                }`}
            >
              <div className="aspect-video bg-neutral-800 overflow-hidden">
                {img.thumb_url
                  ? <img src={img.thumb_url} alt="" className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex items-center justify-center text-neutral-600 text-xs">no thumb</div>
                }
              </div>
              <div className="p-2 bg-neutral-900">
                <p className="text-xs text-neutral-200 truncate">{img.original_filename}</p>
                <p className="text-xs text-neutral-500 mt-0.5">
                  {img.width}×{img.height} · {fmt(img.byte_length)}
                </p>
                {img.tags?.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {img.tags.slice(0, 3).map(t => (
                      <span key={t} className="text-[10px] bg-neutral-800 text-neutral-400 px-1.5 py-0.5 rounded">
                        {t}
                      </span>
                    ))}
                  </div>
                )}
                {img.analysis?.length > 0 && (
                  <p className="text-[10px] text-accent/60 mt-1.5">
                    {img.analysis.length} analysis result{img.analysis.length !== 1 ? 's' : ''}
                  </p>
                )}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
