import { useState, useEffect, useRef } from 'react'
import { client } from '@gradio/client'
import './App.css'

function App() {
  const [personImage, setPersonImage] = useState(null)
  const [garmentImage, setGarmentImage] = useState(null)
  const [resultImage, setResultImage] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [garmentLocked, setGarmentLocked] = useState(false)
  const [personFile, setPersonFile] = useState(null)
  const [garmentFile, setGarmentFile] = useState(null)
  const [personDragging, setPersonDragging] = useState(false)
  const [progress, setProgress] = useState(0)

  const resultRef = useRef(null)

  useEffect(() => {
    const handleMessage = (e) => {
      if (e.data?.type === 'garment' && e.data?.image) {
        const img = e.data.image
        setGarmentImage(img)
        setGarmentLocked(true)
        base64ToFile(img, 'garment.jpg').then(file => setGarmentFile(file))
      }
    }
    window.addEventListener('message', handleMessage)
    if (window.opener) window.opener.postMessage('vto_ready', '*')
    return () => window.removeEventListener('message', handleMessage)
  }, [])

  useEffect(() => {
    if (loading) {
      setProgress(0)
      const interval = setInterval(() => {
        setProgress(prev => prev < 90 ? prev + Math.random() * 8 : prev)
      }, 800)
      return () => clearInterval(interval)
    } else {
      setProgress(100)
    }
  }, [loading])

  const handleImageUpload = (e, type) => {
    const file = e.target.files[0]
    if (!file || !file.type.startsWith('image/')) { setError('Please upload an image file'); return }
    const reader = new FileReader()
    reader.onloadend = () => {
      if (type === 'person') { setPersonImage(reader.result); setPersonFile(file) }
      else { setGarmentImage(reader.result); setGarmentFile(file) }
      setError(null)
    }
    reader.readAsDataURL(file)
  }

  const handleDrop = (e, type) => {
    e.preventDefault()
    setPersonDragging(false)
    const file = e.dataTransfer.files[0]
    if (!file || !file.type.startsWith('image/')) { setError('Please drop a valid image'); return }
    const reader = new FileReader()
    reader.onloadend = () => {
      if (type === 'person') { setPersonImage(reader.result); setPersonFile(file) }
      else { setGarmentImage(reader.result); setGarmentFile(file) }
      setError(null)
    }
    reader.readAsDataURL(file)
  }

  const generateTryOn = async () => {
    if (!personFile || !garmentFile) { setError('Please upload your photo first'); return }
    setLoading(true); setError(null); setResultImage(null)
    try {
      const app = await client("franciszzj/Leffa")
      const pFile = await processImage(personImage, 'person.jpg')
      const gFile = await processImage(garmentImage, 'garment.jpg')
      const result = await app.predict("/leffa_predict_vt", [
        pFile, gFile, false, 30, 2.5, 42, "viton_hd", "upper_body", false,
      ])
      if (!result.data?.[0]) throw new Error('No result from API')
      const imageResult = result.data[0]
      let finalUrl
      if (typeof imageResult === 'string') {
        finalUrl = imageResult.startsWith('data:') || imageResult.startsWith('http') || imageResult.startsWith('blob:')
          ? imageResult : `data:image/jpeg;base64,${imageResult}`
      } else if (imageResult?.url) finalUrl = imageResult.url
      else if (imageResult instanceof Blob || imageResult instanceof File) finalUrl = URL.createObjectURL(imageResult)
      else throw new Error('Unknown result format')
      setResultImage(finalUrl)
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth' }), 300)
    } catch (err) {
      setError(err.message || 'Failed to generate. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const processImage = async (image, filename) => {
    if (image.startsWith('data:')) return await base64ToFile(image, filename)
    const response = await fetch(image)
    const blob = await response.blob()
    return new File([blob], filename, { type: blob.type })
  }

  const base64ToFile = async (base64String, filename) => {
    const b64 = base64String.includes('base64,') ? base64String.split('base64,')[1] : base64String
    const byteStr = atob(b64)
    const ab = new ArrayBuffer(byteStr.length)
    const ia = new Uint8Array(ab)
    for (let i = 0; i < byteStr.length; i++) ia[i] = byteStr.charCodeAt(i)
    return new File([new Blob([ab], { type: 'image/jpeg' })], filename, { type: 'image/jpeg' })
  }

  const handleDownload = () => {
    const a = document.createElement('a')
    a.href = resultImage
    a.download = 'virtual-tryon-result.jpg'
    a.click()
  }

  return (
    <div className="vto-root">
      {/* Animated background orbs */}
      <div className="bg-orb orb1" />
      <div className="bg-orb orb2" />
      <div className="bg-orb orb3" />

      {/* Navbar */}
      <nav className="vto-nav">
        <div className="nav-logo">
          <span className="logo-icon">✦</span>
          <span className="logo-text">FitAI</span>
        </div>
        <div className="nav-links">
          <a href="#" className="nav-link">Explore</a>
          <a href="#" className="nav-link">Trending</a>
          <a href="#" className="nav-link">Collections</a>
        </div>
        <div className="nav-right">
          <span className="nav-icon">🔔</span>
          <span className="nav-icon">🛒</span>
          <div className="nav-avatar">U</div>
        </div>
      </nav>

      <main className="vto-main">
        {/* Hero Title */}
        <div className="vto-hero">
          <div className="ai-badge">
            <span className="badge-dot" />
            AI Powered Try-On
          </div>
          <h1 className="vto-title">
            See It On <span className="gradient-text">You</span>, Before You Buy
          </h1>
          <p className="vto-subtitle">
            Upload your photo. Our AI instantly shows how the garment fits your body — no dressing room needed.
          </p>
        </div>

        {/* Two-Panel Upload */}
        <div className="panels-wrapper">
          {/* Left — Person */}
          <div className="panel glass-card person-panel">
            <div className="panel-header">
              <span className="panel-num">01</span>
              <div>
                <h3 className="panel-title">Your Photo</h3>
                <p className="panel-sub">Upload a full-body or half-body photo</p>
              </div>
            </div>

            <label
              className={`drop-zone ${personDragging ? 'dragging' : ''} ${personImage ? 'has-image' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setPersonDragging(true) }}
              onDragLeave={() => setPersonDragging(false)}
              onDrop={(e) => handleDrop(e, 'person')}
            >
              <input type="file" accept="image/*" onChange={(e) => handleImageUpload(e, 'person')} hidden />
              {personImage ? (
                <div className="image-preview-wrap">
                  <img src={personImage} alt="You" className="preview-img" />
                  <div className="image-overlay">
                    <span>Change Photo</span>
                  </div>
                </div>
              ) : (
                <div className="drop-content">
                  <div className="upload-icon">📸</div>
                  <p className="drop-title">Drag & drop your photo</p>
                  <p className="drop-hint">or <span className="drop-link">browse files</span></p>
                  <p className="drop-formats">PNG, JPG, WEBP · Max 10MB</p>
                </div>
              )}
            </label>

            {personImage && (
              <div className="panel-status success">
                <span>✓</span> Photo ready
              </div>
            )}
          </div>

          {/* Center divider */}
          <div className="panel-divider">
            <div className="divider-line" />
            <div className="divider-icon">⚡</div>
            <div className="divider-line" />
          </div>

          {/* Right — Garment */}
          <div className="panel glass-card garment-panel">
            <div className="panel-header">
              <span className="panel-num">02</span>
              <div>
                <h3 className="panel-title">Garment</h3>
                <p className="panel-sub">
                  {garmentLocked ? 'Pre-loaded from shop' : 'Upload garment image'}
                </p>
              </div>
              {garmentLocked && <div className="locked-badge">From Shop ✓</div>}
            </div>

            <div className={`garment-display ${garmentLocked ? 'locked' : ''}`}>
              {garmentImage ? (
                <div className="image-preview-wrap">
                  <img src={garmentImage} alt="Garment" className="preview-img garment-img" />
                  {garmentLocked && <div className="lock-overlay"><span>🔒</span></div>}
                </div>
              ) : (
                <label className="drop-zone">
                  <input type="file" accept="image/*" onChange={(e) => handleImageUpload(e, 'garment')} hidden />
                  <div className="drop-content">
                    <div className="upload-icon">👗</div>
                    <p className="drop-title">Upload garment</p>
                    <p className="drop-hint">or <span className="drop-link">browse files</span></p>
                  </div>
                </label>
              )}
            </div>

            {/* Decorative product meta */}
            {garmentImage && (
              <div className="garment-meta">
                <div className="size-row">
                  <span className="meta-label">Size</span>
                  <div className="size-chips">
                    {['XS', 'S', 'M', 'L', 'XL'].map(s => (
                      <button key={s} className={`size-chip ${s === 'M' ? 'active' : ''}`}>{s}</button>
                    ))}
                  </div>
                </div>
                <div className="color-row">
                  <span className="meta-label">Color</span>
                  <div className="color-swatches">
                    {['#e8d5c4', '#2a3f5f', '#8b4513', '#1a1a1a', '#c0392b'].map((c, i) => (
                      <div key={i} className={`swatch ${i === 0 ? 'active' : ''}`} style={{ background: c }} />
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="error-toast">
            <span>⚠️</span> {error}
          </div>
        )}

        {/* CTA Button */}
        <div className="cta-wrap">
          <button
            className={`cta-btn ${loading ? 'loading' : ''}`}
            onClick={generateTryOn}
            disabled={!personImage || !garmentImage || loading}
          >
            {loading ? (
              <>
                <span className="btn-spinner" />
                Generating your look...
              </>
            ) : (
              <>
                ✨ Try It On
                <span className="btn-arrow">→</span>
              </>
            )}
          </button>
          {loading && (
            <div className="progress-bar-wrap">
              <div className="progress-bar" style={{ width: `${progress}%` }} />
            </div>
          )}
          <p className="cta-hint">Powered by Leffa AI · Results in ~30s</p>
        </div>

        {/* Result Section */}
        {resultImage && !loading && (
          <div className="result-section glass-card" ref={resultRef}>
            <div className="result-header">
              <div>
                <h2 className="result-title">✨ Your Look</h2>
                <p className="result-sub">AI-generated virtual try-on result</p>
              </div>
              <div className="result-actions">
                <button className="action-btn" onClick={handleDownload}>
                  ⬇ Download
                </button>
                <button className="action-btn share">
                  ↗ Share
                </button>
              </div>
            </div>
            <div className="result-showcase">
              <img src={resultImage} alt="Try-On Result" className="result-img" />
            </div>
            <div className="result-footer">
              <span className="result-tag">AI Generated</span>
              <span className="result-tag">Virtual Try-On</span>
              <span className="result-tag">FitAI™</span>
            </div>
          </div>
        )}
      </main>

      <footer className="vto-footer">
        <p>© 2025 FitAI · Virtual Fashion Intelligence</p>
      </footer>
    </div>
  )
}

export default App
