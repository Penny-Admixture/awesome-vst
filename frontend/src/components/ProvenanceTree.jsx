// Recursively follows source_image_id / source_audio_id to show the derivation chain.
// Real usage: replace mockImages/mockAudio with API calls via getImage(id)/getAudio(id).

import { mockImages, mockAudio } from '../data/mock'

function resolveParent(item, type) {
  if (type === 'image' && item.source_image_id)
    return { item: mockImages.find(i => i.id === item.source_image_id), type: 'image' }
  if (type === 'audio' && item.source_audio_id)
    return { item: mockAudio.find(a => a.id === item.source_audio_id), type: 'audio' }
  return null
}

function ProvenanceNode({ item, type, isLeaf }) {
  const parent = resolveParent(item, type)

  return (
    <div className="flex flex-col items-start gap-1">
      <div className={`rounded border px-2.5 py-1.5 text-xs max-w-full
        ${isLeaf
          ? 'border-accent bg-accent/10 text-accent'
          : 'border-neutral-700 bg-neutral-800 text-neutral-300'
        }`}
      >
        <p className="font-medium truncate max-w-[200px]">{item.original_filename}</p>
        <p className="text-neutral-500 mt-0.5">
          id {item.id}
          {item.produced_by_sequence_id && (
            <> · <span className="text-neutral-400">via seq {item.produced_by_sequence_id}</span></>
          )}
          {item.produced_iteration != null && (
            <> · iter {item.produced_iteration}</>
          )}
        </p>
      </div>

      {parent?.item && (
        <>
          {/* connector line */}
          <div className="ml-3 w-px h-3 bg-neutral-700" />
          <div className="ml-3 flex items-start gap-1.5">
            <div className="mt-2 w-2 h-px bg-neutral-700" />
            <ProvenanceNode item={parent.item} type={parent.type} isLeaf={false} />
          </div>
        </>
      )}

      {!parent?.item && (item.source_image_id || item.source_audio_id) && (
        <div className="ml-3 mt-1 text-[10px] text-neutral-600 italic">
          parent id {item.source_image_id ?? item.source_audio_id} not in local data
        </div>
      )}
    </div>
  )
}

export default function ProvenanceTree({ item, type }) {
  const hasProvenance = !!(item.source_image_id || item.source_audio_id || item.produced_by_sequence_id)

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-xs text-neutral-500 uppercase tracking-widest">Provenance</h3>
      {hasProvenance
        ? <ProvenanceNode item={item} type={type} isLeaf />
        : (
          <div className="rounded border border-neutral-800 p-3 text-xs text-neutral-500">
            Source artifact — no recorded parent.
          </div>
        )
      }
    </div>
  )
}
