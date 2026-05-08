import { useRef, useState } from 'react'
import { Upload, X, Save, Settings } from 'lucide-react'
import { useConfig } from '../context/ConfigContext'
import api from '../services/api'

export default function SettingsPage() {
  const { logoSvg, setLogoSvg } = useConfig()
  const [preview, setPreview] = useState(logoSvg)
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
      await api.patch('/users/config/', { logo_svg: preview })
      setLogoSvg(preview)
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
                <div dangerouslySetInnerHTML={{ __html: preview }} style={{ maxWidth: 240, maxHeight: 80, display: 'flex', alignItems: 'center', justifyContent: 'center' }} />
              ) : (
                <span className="text-muted text-sm">Sin logo — se mostrará el nombre del sistema</span>
              )}
            </div>

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
