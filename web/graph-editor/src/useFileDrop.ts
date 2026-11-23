import { useEffect, useRef, useState } from 'react'

// A drag carries files only when its types say so: dragging a node or text inside the page does not.
export const hasFiles = (dt: Pick<DataTransfer, 'types'> | null): boolean => !!dt && Array.from(dt.types).includes('Files')

// Graph file drop (Aurora-dzsd): true while a file is dragged over the window, for the hint.
// dragover and drop are cancelled for files, or the browser navigates the tab to the dropped file.
export function useFileDrop(onFiles: (files: File[], at: { x: number; y: number }) => void): boolean {
  const [over, setOver] = useState(false)
  const latest = useRef(onFiles)
  latest.current = onFiles
  useEffect(() => {
    // dragenter and dragleave fire for every child element, so the depth says when the drag really left.
    let depth = 0
    const reset = () => {
      depth = 0
      setOver(false)
    }
    const enter = (e: DragEvent) => {
      if (!hasFiles(e.dataTransfer)) return
      e.preventDefault()
      depth += 1
      setOver(true)
    }
    const move = (e: DragEvent) => {
      if (!hasFiles(e.dataTransfer)) return
      e.preventDefault()
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
    }
    const leave = (e: DragEvent) => {
      if (!hasFiles(e.dataTransfer)) return
      depth = Math.max(0, depth - 1)
      if (depth === 0) setOver(false)
    }
    const drop = (e: DragEvent) => {
      if (!hasFiles(e.dataTransfer)) return
      e.preventDefault()
      reset()
      const files = Array.from(e.dataTransfer?.files ?? [])
      if (files.length > 0) latest.current(files, { x: e.clientX, y: e.clientY })
    }
    window.addEventListener('dragenter', enter)
    window.addEventListener('dragover', move)
    window.addEventListener('dragleave', leave)
    window.addEventListener('drop', drop)
    window.addEventListener('blur', reset)
    return () => {
      window.removeEventListener('dragenter', enter)
      window.removeEventListener('dragover', move)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('drop', drop)
      window.removeEventListener('blur', reset)
    }
  }, [])
  return over
}
