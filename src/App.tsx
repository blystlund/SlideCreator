import { useState, useRef, useEffect, useCallback } from 'react'
import mammoth from 'mammoth'
import './App.css'

interface Slide {
  id: string
  type: 'verse' | 'text'
  content: string
  reference?: string
}

const CANVAS_WIDTH = 1920
const CANVAS_HEIGHT = 1080
const MARGIN = 160

async function fetchVerse(reference: string): Promise<{ verse: string; reference: string } | null> {
  try {
    const encoded = encodeURIComponent(reference.trim())
    const response = await fetch(`https://bible-api.com/${encoded}?translation=kjv`)
    if (!response.ok) return null
    const data = await response.json()
    if (data.error) return null
    if (data.verses && data.verses.length > 0) {
      const text = data.verses.map((v: any) => v.text.trim()).join(' ')
      return {
        verse: text,
        reference: data.reference || `${data.verses[0].book_name} ${data.verses[0].chapter}:${data.verses[0].verse}`
      }
    }
    return null
  } catch {
    return null
  }
}

function SlidePreview({ slide }: { slide: Slide }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const drawCanvas = useCallback(async () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    await Promise.all([
      document.fonts.load(`600 64px "Montserrat"`),
      document.fonts.load(`500 36px "Montserrat"`),
    ]).catch(() => {})

    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

    const mainFontSize = slide.type === 'verse' ? 64 : 56
    const refFontSize = 36

    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = '#ffffff'
    ctx.font = `600 ${mainFontSize}px "Montserrat", sans-serif`

    const maxWidth = CANVAS_WIDTH - MARGIN * 2
    const centerX = CANVAS_WIDTH / 2
    const centerY = CANVAS_HEIGHT / 2

    const words = slide.content.split(' ')
    const lines: string[] = []
    let currentLine = ''

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word
      if (ctx.measureText(testLine).width > maxWidth && currentLine) {
        lines.push(currentLine)
        currentLine = word
      } else {
        currentLine = testLine
      }
    }
    if (currentLine) lines.push(currentLine)

    const lineHeight = mainFontSize * 1.4
    const refHeight = refFontSize * 1.4
    const totalHeight = lines.length * lineHeight + (slide.reference ? refHeight + 24 : 0)

    let y = centerY - totalHeight / 2 + lineHeight / 2
    for (const line of lines) {
      ctx.fillText(line, centerX, y)
      y += lineHeight
    }

    if (slide.reference) {
      ctx.font = `500 ${refFontSize}px "Montserrat", sans-serif`
      ctx.fillStyle = '#cccccc'
      ctx.fillText(slide.reference, centerX, y + 24)
    }
  }, [slide])

  useEffect(() => { drawCanvas() }, [drawCanvas])

  return (
    <canvas
      ref={canvasRef}
      width={CANVAS_WIDTH}
      height={CANVAS_HEIGHT}
      style={{ width: '100%', height: 'auto', display: 'block' }}
    />
  )
}

export default function App() {
  const [slides, setSlides] = useState<Slide[]>([])
  const [verseInput, setVerseInput] = useState('')
  const [verseLoading, setVerseLoading] = useState(false)
  const [verseError, setVerseError] = useState('')
  const [inputText, setInputText] = useState('')
  const [exporting, setExporting] = useState(false)

  // Insert-at position: null = append to end
  const [insertAfter, setInsertAfter] = useState<number | null>(null)

  // Edit panel (right side)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  const [editReference, setEditReference] = useState('')

  const fileInputRef = useRef<HTMLInputElement>(null)
  const canvasGridRef = useRef<HTMLDivElement>(null)
  const editTextareaRef = useRef<HTMLTextAreaElement>(null)

  const editingSlide = slides.find(s => s.id === editingId) ?? null

  // ── Verse ─────────────────────────────────────────────────────────────────

  const addVerseSlide = async () => {
    if (!verseInput.trim()) return
    setVerseLoading(true)
    setVerseError('')
    const result = await fetchVerse(verseInput)
    setVerseLoading(false)
    if (result) {
      const newSlide: Slide = {
        id: crypto.randomUUID(),
        type: 'verse',
        content: result.verse,
        reference: result.reference,
      }
      setSlides(prev => {
        if (insertAfter === null) return [...prev, newSlide]
        const arr = [...prev]
        arr.splice(insertAfter + 1, 0, newSlide)
        return arr
      })
      setVerseInput('')
      if (insertAfter !== null) setInsertAfter(insertAfter + 1)
    } else {
      setVerseError('Verse not found. Try "John 3:16" or "Psalm 23:1-6".')
    }
  }

  const selectInsertPosition = (index: number) => {
    setInsertAfter(prev => prev === index ? null : index)
  }

  // ── Text / docx ───────────────────────────────────────────────────────────

  const addTextSlides = () => {
    if (!inputText.trim()) return
    const lines = inputText.split('\n').filter(l => l.trim())
    setSlides(prev => [...prev, ...lines.map(line => ({
      id: crypto.randomUUID(),
      type: 'text' as const,
      content: line.trim(),
    }))])
    setInputText('')
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    let text = ''
    if (file.name.endsWith('.docx')) {
      try {
        const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })
        text = result.value
      } catch {
        alert('Could not read .docx file. Try a different file or paste text directly.')
        return
      }
    } else if (file.name.endsWith('.txt')) {
      text = await file.text()
    } else {
      alert('Please use .docx or .txt files.')
      return
    }
    setSlides(prev => [...prev, ...text.split('\n').filter(l => l.trim()).map(line => ({
      id: crypto.randomUUID(),
      type: 'text' as const,
      content: line.trim(),
    }))])
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // ── Edit panel ────────────────────────────────────────────────────────────

  const startEdit = (slide: Slide) => {
    setEditingId(slide.id)
    setEditContent(slide.content)
    setEditReference(slide.reference || '')
    setTimeout(() => editTextareaRef.current?.focus(), 50)
  }

  const saveEdit = () => {
    if (!editingId) return
    setSlides(prev => prev.map(s =>
      s.id === editingId
        ? { ...s, content: editContent, reference: editReference || s.reference }
        : s
    ))
    setEditingId(null)
  }

  const cancelEdit = () => setEditingId(null)

  // ── Slide management ──────────────────────────────────────────────────────

  const removeSlide = (id: string) => {
    if (editingId === id) setEditingId(null)
    setSlides(prev => prev.filter(s => s.id !== id))
  }

  const moveSlide = (index: number, dir: 'up' | 'down') => {
    const next = dir === 'up' ? index - 1 : index + 1
    if (next < 0 || next >= slides.length) return
    setSlides(prev => {
      const arr = [...prev];
      [arr[index], arr[next]] = [arr[next], arr[index]]
      return arr
    })
  }

  // ── Download ──────────────────────────────────────────────────────────────

  const downloadCanvas = (canvas: HTMLCanvasElement, slide: Slide, index: number) => {
    const a = document.createElement('a')
    a.href = canvas.toDataURL('image/png')
    a.download = slide.type === 'verse'
      ? `verse-${(slide.reference || '').replace(/[\s:]/g, '-')}.png`
      : `slide-${index + 1}.png`
    a.click()
  }

  const downloadOne = (index: number) => {
    const canvases = canvasGridRef.current?.querySelectorAll('canvas')
    const canvas = canvases?.[index] as HTMLCanvasElement | undefined
    if (canvas) downloadCanvas(canvas, slides[index], index)
  }

  const downloadAll = async () => {
    setExporting(true)
    const canvases = canvasGridRef.current?.querySelectorAll('canvas')
    if (!canvases || !canvases.length) { setExporting(false); return }
    for (let i = 0; i < canvases.length; i++) {
      downloadCanvas(canvases[i] as HTMLCanvasElement, slides[i], i)
      await new Promise(r => setTimeout(r, 300))
    }
    setExporting(false)
  }

  const clearAll = () => { if (confirm('Remove all slides?')) { setSlides([]); setEditingId(null) } }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="app">
      <header className="header">
        <img src="/bwbc_light_logo.png" alt="BWBC" className="header-logo" />
        <div className="header-text">
          <h1>Sermon Slide Creator</h1>
          <p>Transparent PNG slides for worship</p>
        </div>
      </header>

      <div className="app-body">

        {/* ── Left panel ─────────────────────────────────────────────────── */}
        <div className="left-panel">

          <section className="input-section">
            <div className="input-card">
              <h2>Scripture Verse</h2>
              {insertAfter !== null ? (
                <p className="input-hint insert-active">
                  Inserting after slide {insertAfter + 1}
                  <button className="clear-insert" onClick={() => setInsertAfter(null)}>✕ back to end</button>
                </p>
              ) : (
                <p className="input-hint">Single verse or passage — e.g. "John 3:16" or "Romans 8:28-30"</p>
              )}
              <div className="input-row">
                <input
                  type="text"
                  value={verseInput}
                  onChange={e => setVerseInput(e.target.value)}
                  placeholder="e.g. John 3:16"
                  onKeyDown={e => e.key === 'Enter' && addVerseSlide()}
                  disabled={verseLoading}
                />
                <button onClick={addVerseSlide} disabled={verseLoading || !verseInput.trim()}>
                  {verseLoading ? 'Loading…' : 'Add'}
                </button>
              </div>
              {verseError && <p className="error">{verseError}</p>}
            </div>

            <div className="input-card">
              <h2>Sermon Notes</h2>
              <p className="input-hint">Each line becomes a slide. Upload .docx or paste text below.</p>
              <textarea
                value={inputText}
                onChange={e => setInputText(e.target.value)}
                placeholder={"Each line becomes its own slide.\nPaste your notes or points here."}
                rows={4}
              />
              <div className="button-row">
                <button onClick={addTextSlides} disabled={!inputText.trim()}>Add as Slides</button>
                <label className="file-label">
                  <input ref={fileInputRef} type="file" accept=".docx,.txt" onChange={handleFileUpload} hidden />
                  <span className="file-button">Upload .docx</span>
                </label>
              </div>
            </div>
          </section>

          <section className="slides-section">
            <div className="slides-header">
              <h2>
                Slides
                {slides.length > 0 && <span className="slide-count">{slides.length}</span>}
              </h2>
              {slides.length > 0 && (
                <div className="header-actions">
                  {insertAfter !== null && (
                    <span className="insert-badge">Inserting after #{insertAfter + 1}</span>
                  )}
                  <button className="clear-btn" onClick={clearAll}>Clear All</button>
                  <button className="download-all" onClick={downloadAll} disabled={exporting}>
                    {exporting ? 'Downloading…' : 'Download All PNGs'}
                  </button>
                </div>
              )}
            </div>

            {slides.length === 0 ? (
              <div className="empty-state">
                <p>No slides yet.</p>
                <p className="empty-hint">Add scripture verses or sermon notes above.</p>
              </div>
            ) : (
              <div className="slides-grid" ref={canvasGridRef}>
                {slides.map((slide, index) => (
                  <div
                    key={slide.id}
                    className={[
                      'slide-item',
                      editingId === slide.id ? 'editing' : '',
                      insertAfter === index ? 'insert-target' : '',
                    ].filter(Boolean).join(' ')}
                  >
                    <div className="slide-preview-wrap" onClick={() => startEdit(slide)}>
                      <SlidePreview slide={slide} />
                      <div className="slide-overlay">
                        <div className="slide-actions-top">
                          <button onClick={e => { e.stopPropagation(); moveSlide(index, 'up') }} disabled={index === 0} title="Move up">↑</button>
                          <button onClick={e => { e.stopPropagation(); moveSlide(index, 'down') }} disabled={index === slides.length - 1} title="Move down">↓</button>
                          <button
                            onClick={e => { e.stopPropagation(); selectInsertPosition(index) }}
                            className={`insert-btn${insertAfter === index ? ' active' : ''}`}
                            title="Insert verse after this slide"
                          >+</button>
                          <button onClick={e => { e.stopPropagation(); startEdit(slide) }} className="edit-btn" title="Edit">✎</button>
                          <button onClick={e => { e.stopPropagation(); removeSlide(slide.id) }} className="delete-btn" title="Remove">✕</button>
                        </div>
                        <button className="download-single" onClick={e => { e.stopPropagation(); downloadOne(index) }}>↓ PNG</button>
                      </div>
                    </div>
                    <div className="slide-label">
                      {slide.type === 'verse' ? slide.reference : slide.content.slice(0, 48)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <footer className="footer">
            <p>1920×1080 · Transparent background · Montserrat · KJV</p>
          </footer>
        </div>

        {/* ── Right edit panel ────────────────────────────────────────────── */}
        <div className={`right-panel${editingId ? '' : ' hidden'}`}>
          {editingSlide && (
            <div className="edit-panel-inner">
              <div className="edit-panel-header">
                <span className="edit-panel-title">
                  {editingSlide.type === 'verse' ? 'Edit Verse' : 'Edit Slide'}
                </span>
                <button className="edit-panel-close" onClick={cancelEdit} title="Close">✕</button>
              </div>

              <label className="edit-label">Text</label>
              <textarea
                ref={editTextareaRef}
                className="edit-textarea"
                value={editContent}
                onChange={e => setEditContent(e.target.value)}
              />

              {editingSlide.type === 'verse' && (
                <>
                  <label className="edit-label">Reference</label>
                  <input
                    className="edit-input"
                    value={editReference}
                    onChange={e => setEditReference(e.target.value)}
                  />
                </>
              )}

              <div className="edit-buttons">
                <button className="btn-cancel" onClick={cancelEdit}>Cancel</button>
                <button className="btn-save" onClick={saveEdit}>Save</button>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
