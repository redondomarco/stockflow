import { useRef, useState } from 'react'
import { Upload, X, Save, Settings } from 'lucide-react'
import { useConfig } from '../context/ConfigContext'
import api from '../services/api'

export default function SettingsPage() {
  const { logoSvg, setLogoSvg, logoWidth, setLogoWidth, pdfLogoWidth, setPdfLogoWidth } = useConfig()
  const [preview, setPreview] = useState(logoSvg)
  const [width, setWidth] = useState(logoWidth)
  const [pdfWidth, setPdfWidth] = useState(pdfLogoWidth)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef()

  const handleFile = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.name.endsWith('.svg') && file.type !== 'image/svg+xml') {
      setError('El archivo debe ser SVG.')
      return
    }
    fileRef.current.value = ''
    const reader = new FileReader()
    reader.onload = (ev) => { setPreview(ev.target.result); setError('') }
    reader.readAsText(file)
  }

  const save = async () => {
    setSaving(true); setError(''); setSaved(false)
    try {
      await api.patch('/users/config/', { logo_svg: preview, logo_width: width, pdf_logo_width: pdfWidth })
      setLogoSvg(preview)
      setLogoWidth(width)
      setPdfLogoWidth(pdfWidth)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (e) {
      setError(e.response?.data?.error || 'Error al guardar')
    } finally { setSaving(false) }
  }

  const clear = () => { setPreview(''); setError('') }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Configuración</h1>
          <p className="page-subtitle">Ajustes generales del sistema</p>
        </div>
      </div>

      <div className="page-body">
        <div className="card" style={{ maxWidth: 600 }}>
          <div style={{ padding: '20px 24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
              <Settings size={16} style={{ color: 'var(--accent)' }} />
              <span style={{ fontWeight: 600, fontSize: 14 }}>Logo del sistema</span>
            </div>

            {error && <div className="alert alert-danger" style={{ marginBottom: 16 }}>{error}</div>}
            {saved && <div className="alert alert-success" style={{ marginBottom: 16 }}>Logo guardado correctamente.</div>}

            {/* Preview */}
            <div style={{ marginBottom: 16, padding: 16, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, minHeight: 80, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {preview ? (
                <div dangerouslySetInnerHTML={{ __html: preview }} style={{ width, display: 'flex', alignItems: 'center', justifyContent: 'center' }} />
              ) : (
                <span className="text-muted text-sm">Sin logo — se mostrará el nombre del sistema</span>
              )}
            </div>

            {/* Width controls */}
            {preview && (
              <>
                <div className="form-group" style={{ marginBottom: 12 }}>
                  <label className="form-label">Tamaño en el sistema — <span className="mono">{width}px</span></label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <input type="range" min="60" max="300" step="10" value={width}
                      onChange={e => setWidth(parseInt(e.target.value))}
                      style={{ flex: 1, accentColor: 'var(--accent)' }} />
                    <input type="number" min="60" max="300" value={width}
                      onChange={e => setWidth(Math.max(60, Math.min(300, parseInt(e.target.value) || 140)))}
                      className="form-input mono" style={{ width: 80 }} />
                    <span className="text-muted text-sm">px</span>
                  </div>
                </div>
                <div className="form-group" style={{ marginBottom: 16 }}>
                  <label className="form-label">Tamaño en PDFs — <span className="mono">{pdfWidth}mm</span></label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <input type="range" min="10" max="80" step="5" value={pdfWidth}
                      onChange={e => setPdfWidth(parseInt(e.target.value))}
                      style={{ flex: 1, accentColor: 'var(--accent)' }} />
                    <input type="number" min="10" max="80" value={pdfWidth}
                      onChange={e => setPdfWidth(Math.max(10, Math.min(80, parseInt(e.target.value) || 35)))}
                      className="form-input mono" style={{ width: 80 }} />
                    <span className="text-muted text-sm">mm</span>
                  </div>
                </div>
              </>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-secondary" onClick={() => fileRef.current.click()}>
                <Upload size={14} /> Cargar SVG
              </button>
              <input ref={fileRef} type="file" accept=".svg,image/svg+xml" style={{ display: 'none' }} onChange={handleFile} />
              {preview && (
                <button className="btn btn-ghost" onClick={clear} style={{ color: 'var(--red)' }}>
                  <X size={14} /> Quitar logo
                </button>
              )}
              <button className="btn btn-primary" onClick={save} disabled={saving} style={{ marginLeft: 'auto' }}>
                <Save size={14} /> {saving ? 'Guardando...' : 'Guardar'}
              </button>
            </div>

            <p className="text-muted text-sm" style={{ marginTop: 12 }}>
              El logo se muestra en el sidebar de la aplicación y en los PDFs generados (hojas de ruta y comprobantes).
            </p>
          </div>
        </div>
      </div>
    </>
  )
}
