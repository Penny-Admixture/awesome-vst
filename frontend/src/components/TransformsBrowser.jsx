import { useEffect, useState } from 'react'
import { listSequences } from '../api/client'
import { useStore } from '../store'
import TransformGraph from './TransformGraph'

export default function TransformsBrowser() {
  const [sequences, setSequences] = useState([])
  const { selected, select } = useStore()

  useEffect(() => {
    listSequences().then(setSequences)
  }, [])

  return (
    <div className="p-4 flex flex-col gap-4">
      {sequences.map(seq => {
        const isSelected = selected?.type === 'sequence' && selected.item.id === seq.id
        return (
          <div
            key={seq.id}
            onClick={() => select('sequence', seq)}
            className={`rounded-lg border cursor-pointer transition-all
              ${isSelected
                ? 'border-accent ring-1 ring-accent'
                : 'border-neutral-800 hover:border-neutral-600'
              }`}
          >
            <div className="flex items-center justify-between px-3 py-2 bg-neutral-900 rounded-t-lg border-b border-neutral-800">
              <div>
                <span className="text-sm text-neutral-100">{seq.name}</span>
                <span className="ml-2 text-xs text-neutral-600">id {seq.id}</span>
              </div>
              <span className="text-xs text-neutral-500">{seq.steps.length} step{seq.steps.length !== 1 ? 's' : ''}</span>
            </div>
            <div className="p-3 bg-neutral-950 rounded-b-lg">
              <TransformGraph sequence={seq} />
            </div>
          </div>
        )
      })}
    </div>
  )
}
