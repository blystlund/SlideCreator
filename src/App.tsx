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
    const formattedRef = reference.trim().replace(/\s+/g, '+').replace(/:/g, '.')
    const response = await fetch(`https://bible-api.com/${formattedRef}?translation=kjv`)
    if (!response.ok) return null
    const data = await response.json()
    if (data.verses && data.verses.length > 0) {
      const v = data.verses[0]
      return {
        verse: v.text.trim(),
        reference: `${v.book_name} ${v.chapter}:${v.verse}`
      }
    }
    return null
  } catch {
    return null
  }
}

function SlidePreview({ slide, index }: { slide: Slide; index: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

    const mainFontSize = slide.type === 'verse' ? 64 : 56
    const refFontSize = 36

    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = '#ffffff'
    ctx.font = `600 ${mainFontSize}px "Montserrat", sans-serif`

    const maxWidth = CANVAS_WIDTH - (MARGIN * 2)
    const centerX = CANVAS_WIDTH / 2
    const centerY = CANVAS_HEIGHT / 2

    const words = slide.content.split(' ')
    const lines: string[] = []
    let currentLine = ''

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word
      const metrics = ctx.measureText(testLine)
      if (metrics.width > maxWidth && currentLine) {
        lines.push(currentLine)
        currentLine = word
      } else {
        currentLine = testLine
      }
    }
    if (currentLine) lines.push(currentLine)

    const lineHeight = mainFontSize * 1.4
    const refLineHeight = refFontSize * 1.4
    const totalHeight = lines.length * lineHeight + (slide.reference ? refLineHeight + 20 : 0)

    let startY = centerY - totalHeight / 2 + lineHeight / 2
    for (const line of lines) {
      ctx.fillText(line, centerX, startY)
      startY += lineHeight
    }

    if (slide.reference) {
      ctx.font = `500 ${refFontSize}px "Montserrat", sans-serif`
      ctx.fillStyle = '#cccccc'
      ctx.fillText(slide.reference, centerX, startY + 20)
    }
  }, [slide])

  useEffect(() => {
    drawCanvas()
  }, [drawCanvas])

  return (
    <div className="slide-preview">
      <div className="slide-canvas-wrapper">
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          style={{ width: '100%', height: 'auto' }}
          data-slide-index={index}
        />
      </div>
      <div className="slide-label">
        {slide.type === 'verse' ? slide.reference : `Text ${index + 1}`}
      </div>
    </div>
  )
}

function App() {
  const [slides, setSlides] = useState<Slide[]>([])
  const [inputText, setInputText] = useState('')
  const [verseInput, setVerseInput] = useState('')
  const [verseLoading, setVerseLoading] = useState(false)
  const [verseError, setVerseError] = useState('')
  const [exporting, setExporting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const canvasContainerRef = useRef<HTMLDivElement>(null)

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
        reference: result.reference
      }
      setSlides(prev => [...prev, newSlide])
      setVerseInput('')
    } else {
      setVerseError('Verse not found. Please check the reference (e.g., "John 3:16")')
    }
  }

  const addTextSlides = () => {
    if (!inputText.trim()) return
    const lines = inputText.split('\n').filter(line => line.trim())
    const newSlides: Slide[] = lines.map(line => ({
      id: crypto.randomUUID(),
      type: 'text' as const,
      content: line.trim()
    }))
    setSlides(prev => [...prev, ...newSlides])
    setInputText('')
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    let text = ''

    if (file.name.endsWith('.docx')) {
      try {
        const arrayBuffer = await file.arrayBuffer()
        const result = await mammoth.extractRawText({ arrayBuffer })
        text = result.value
      } catch (err) {
        alert('Could not read .docx file. Please try a different file or paste text directly.')
        return
      }
    } else if (file.name.endsWith('.txt')) {
      text = await file.text()
    } else {
      alert('Please use .docx or .txt files.')
      return
    }

    const lines = text.split('\n').filter(line => line.trim())
    const newSlides: Slide[] = lines.map(line => ({
      id: crypto.randomUUID(),
      type: 'text' as const,
      content: line.trim()
    }))
    setSlides(prev => [...prev, ...newSlides])

    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const removeSlide = (index: number) => {
    setSlides(prev => prev.filter((_, i) => i !== index))
  }

  const moveSlide = (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1
    if (newIndex < 0 || newIndex >= slides.length) return
    setSlides(prev => {
      const newSlides = [...prev]
      ;[newSlides[index], newSlides[newIndex]] = [newSlides[newIndex], newSlides[index]]
      return newSlides
    })
  }

  const downloadAllAsPng = async () => {
    setExporting(true)
    const canvases = canvasContainerRef.current?.querySelectorAll('canvas')

    if (!canvases || canvases.length === 0) {
      setExporting(false)
      return
    }

    for (let i = 0; i < canvases.length; i++) {
      const canvas = canvases[i] as HTMLCanvasElement
      const slide = slides[i]

      await new Promise(resolve => setTimeout(resolve, 50))

      const dataUrl = canvas.toDataURL('image/png')
      const link = document.createElement('a')
      const filename = slide.type === 'verse'
        ? `verse-${slide.reference?.replace(/\s+/g, '-').replace(/:/g, '-')}.png`
        : `slide-${i + 1}.png`
      link.download = filename
      link.href = dataUrl
      link.click()

      await new Promise(resolve => setTimeout(resolve, 200))
    }

    setExporting(false)
  }

  const clearAll = () => {
    if (confirm('Remove all slides?')) {
      setSlides([])
    }
  }

  return (
    <div className="app">
      <header className="header">
        <img src="/WHT_Logo.png" alt="Logo" className="header-logo" />
        <h1>Sermon Slide Creator</h1>
        <p>Transparent PNG slides for worship</p>
      </header>

      <main className="main">
        <section className="input-section">
          <div className="input-card">
            <h2>Scripture Verse</h2>
            <p className="input-hint">Enter a Bible reference (e.g., "John 3:16", "Psalm 23:1")</p>
            <div className="input-row">
              <input
                type="text"
                value={verseInput}
                onChange={e => setVerseInput(e.target.value)}
                placeholder="e.g., John 3:16"
                onKeyDown={e => e.key === 'Enter' && addVerseSlide()}
                disabled={verseLoading}
              />
              <button onClick={addVerseSlide} disabled={verseLoading || !verseInput.trim()}>
                {verseLoading ? 'Loading...' : 'Add Verse'}
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
              placeholder="Enter sermon point text here...&#10;Each line becomes a separate slide."
              rows={4}
            />
            <div className="button-row">
              <button onClick={addTextSlides} disabled={!inputText.trim()}>
                Add as Slides
              </button>
              <label className="file-label">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".docx,.txt"
                  onChange={handleFileUpload}
                  hidden
                />
                <span className="file-button">Upload .docx</span>
              </label>
            </div>
          </div>
        </section>

        <section className="slides-section">
          <div className="slides-header">
            <h2>Slides ({slides.length})</h2>
            <div className="header-actions">
              {slides.length > 0 && (
                <>
                  <button className="clear-btn" onClick={clearAll}>Clear All</button>
                  <button className="download-all" onClick={downloadAllAsPng} disabled={exporting}>
                    {exporting ? 'Exporting...' : 'Download All PNGs'}
                  </button>
                </>
              )}
            </div>
          </div>

          {slides.length === 0 ? (
            <div className="empty-state">
              <p>No slides yet.</p>
              <p className="empty-hint">Add scripture verses or sermon notes above.</p>
            </div>
          ) : (
            <div className="slides-grid" ref={canvasContainerRef}>
              {slides.map((slide, index) => (
                <div key={slide.id} className="slide-item">
                  <div className="slide-actions">
                    <button
                      onClick={() => moveSlide(index, 'up')}
                      disabled={index === 0}
                      title="Move up"
                    >
                      ↑
                    </button>
                    <button
                      onClick={() => moveSlide(index, 'down')}
                      disabled={index === slides.length - 1}
                      title="Move down"
                    >
                      ↓
                    </button>
                    <button
                      onClick={() => removeSlide(index)}
                      className="delete-btn"
                      title="Remove"
                    >
                      ×
                    </button>
                  </div>
                  <SlidePreview slide={slide} index={index} />
                </div>
              ))}
            </div>
          )}
        </section>

        <footer className="footer">
          <p>1920×1080 PNGs with transparent backgrounds • Montserrat font • KJV Bible</p>
        </footer>
      </main>
    </div>
  )
}

export default App
