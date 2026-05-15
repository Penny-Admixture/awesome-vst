import LoopArranger from './LoopArranger'
import { mockAudio } from '../data/mock'

export default function LoopsBrowser() {
  // Show one arranger per source audio that has loops
  // Real usage: query distinct source_audio_id values from roseglassdb_audio_loops
  const sourcesWithLoops = [mockAudio[0]]

  return (
    <div className="flex flex-col divide-y divide-neutral-800">
      {sourcesWithLoops.map(src => (
        <div key={src.id}>
          <LoopArranger sourceAudioId={src.id} />
        </div>
      ))}
    </div>
  )
}
