import { create } from 'zustand'

export const useStore = create((set, get) => ({
  view: 'images',
  selected: null, // { type: 'image'|'audio'|'video'|'transforms'|'loops', item }

  setView(view) {
    set({ view, selected: null })
  },

  select(type, item) {
    const { selected } = get()
    const same = selected?.type === type && selected?.item?.id === item.id
    set({ selected: same ? null : { type, item } })
  },

  clearSelected() {
    set({ selected: null })
  },
}))
