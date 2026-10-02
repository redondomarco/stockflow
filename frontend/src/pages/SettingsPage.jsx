import { useEffect, useRef, useState } from 'react'
import { Upload, X, Save, Settings, Package, CreditCard, RotateCcw, ShieldCheck, Image } from 'lucide-react'
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

        <FaviconCard />

        <PolicySettings />
      </div>
    </>
  )
}

const FAVICON_MAX_KB = 100
const FAVICON_TYPES = ['image/svg+xml', 'image/png', 'image/x-icon', 'image/vnd.microsoft.icon']

// Actualiza el ícono de la pestaña sin recargar (el ?v= evita la copia en caché)
function refreshTabIcon() {
  const link = document.querySelector('link[rel="icon"]')
  if (link) link.href = `/api/users/favicon/?v=${Date.now()}`
}

function FaviconCard() {
  const [saved, setSaved] = useState(null)       // data URL guardado ('' = ícono por defecto)
  const [preview, setPreview] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(null)
  const fileRef = useRef()

  useEffect(() => {
    api.get('/users/config/').then(r => {
      setSaved(r.data.favicon || '')
      setPreview(r.data.favicon || '')
    }).catch(() => setSaved(''))
  }, [])

  const handleFile = (e) => {
    const file = e.target.files?.[0]
    fileRef.current.value = ''
    if (!file) return
    // Algunos sistemas no informan el tipo de los .ico
    const type = file.type || (file.name.toLowerCase().endsWith('.ico') ? 'image/x-icon' : '')
    if (!FAVICON_TYPES.includes(type)) {
      setMessage({ type: 'danger', text: 'El favicon debe ser SVG, PNG o ICO.' }); return
    }
    if (file.size > FAVICON_MAX_KB * 1024) {
      setMessage({ type: 'danger', text: `El archivo supera ${FAVICON_MAX_KB} KB.` }); return
    }
    const reader = new FileReader()
    reader.onload = (ev) => {
      // Normaliza el tipo en el data URL (los .ico a veces llegan como application/octet-stream)
      const base64 = String(ev.target.result).split(',')[1]
      setPreview(`data:${type};base64,${base64}`)
      setMessage(null)
    }
    reader.readAsDataURL(file)
  }

  const save = async (value) => {
    setSaving(true); setMessage(null)
    try {
      await api.patch('/users/config/', { favicon: value })
      setSaved(value); setPreview(value)
      refreshTabIcon()
      setMessage({ type: 'success', text: value ? 'Favicon guardado.' : 'Se restauró el ícono por defecto.' })
      setTimeout(() => setMessage(null), 3000)
    } catch (e) {
      setMessage({ type: 'danger', text: e.response?.data?.error || 'Error al guardar' })
    } finally { setSaving(false) }
  }

  if (saved === null) return null
  const shown = preview || '/api/users/favicon/'
  const changed = preview !== saved

  return (
    <div className="card" style={{ maxWidth: 600, marginTop: 20 }}>
      <div style={{ padding: '20px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <Image size={16} style={{ color: 'var(--accent)' }} />
          <span style={{ fontWeight: 600, fontSize: 14 }}>Favicon</span>
        </div>

        {message && <div className={`alert alert-${message.type}`} style={{ marginBottom: 16 }}>{message.text}</div>}

        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16, padding: 16, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8 }}>
          <img src={shown} alt="Favicon" width={48} height={48} style={{ objectFit: 'contain' }} />
          <img src={shown} alt="" width={32} height={32} style={{ objectFit: 'contain' }} />
          <img src={shown} alt="" width={16} height={16} style={{ objectFit: 'contain' }} />
          <span className="text-muted text-sm">
            {preview ? (changed ? 'Vista previa (sin guardar)' : 'Favicon actual') : 'Ícono por defecto'}
          </span>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" onClick={() => fileRef.current.click()} disabled={saving}>
            <Upload size={14} /> Cargar imagen
          </button>
          <input ref={fileRef} type="file" accept=".svg,.png,.ico,image/svg+xml,image/png,image/x-icon" style={{ display: 'none' }} onChange={handleFile} />
          {saved && (
            <button className="btn btn-ghost" onClick={() => save('')} disabled={saving} style={{ color: 'var(--red)' }}>
              <X size={14} /> Usar ícono por defecto
            </button>
          )}
          {changed && (
            <button className="btn btn-primary" onClick={() => save(preview)} disabled={saving} style={{ marginLeft: 'auto' }}>
              <Save size={14} /> {saving ? 'Guardando...' : 'Guardar'}
            </button>
          )}
        </div>

        <p className="text-muted text-sm" style={{ marginTop: 12 }}>
          Ícono de la pestaña del navegador y de los accesos directos. SVG, PNG o ICO de hasta {FAVICON_MAX_KB} KB;
          idealmente cuadrado (por ejemplo 64×64 o 512×512).
        </p>
      </div>
    </div>
  )
}

const POLICY_GROUPS = [
  {
    field: 'stock_policy', icon: Package, title: 'Pedidos sin stock suficiente',
    footnote: 'Los productos con "Controlar stock" desactivado nunca se validan, sin importar esta opción.',
    options: [
      { value: 'allow', label: 'Permitir sin stock', help: 'Los pedidos se registran aunque no haya stock; el stock puede quedar negativo.' },
      { value: 'warn', label: 'Avisar y pedir confirmación', help: 'Si falta stock se muestra el detalle y el usuario puede confirmar el pedido igual.' },
      { value: 'block', label: 'Bloquear pedidos sin stock', help: 'Si falta stock el pedido se rechaza. Solo los usuarios habilitados ("Puede confirmar sin stock") pueden confirmarlo.' },
    ],
  },
  {
    field: 'overpayment_policy', icon: CreditCard, title: 'Pagos mayores al saldo del pedido',
    footnote: 'Se controla al registrar el pago y otra vez al aprobarlo.',
    options: [
      { value: 'allow', label: 'Permitir', help: 'El excedente queda como saldo a favor del cliente y se anota en el pago.' },
      { value: 'warn', label: 'Avisar y pedir confirmación', help: 'Se muestra cuánto excede el saldo y el usuario puede confirmar igual.' },
      { value: 'block', label: 'Bloquear', help: 'No se aceptan pagos que superen el saldo pendiente.' },
    ],
  },
  {
    field: 'cancelled_order_payments', icon: RotateCcw, title: 'Pagos aprobados de pedidos anulados',
    footnote: 'Los pagos pendientes de un pedido anulado se rechazan siempre.',
    options: [
      { value: 'keep', label: 'Dejar como están', help: 'Los pagos aprobados se conservan sin cambios.' },
      { value: 'review', label: 'Marcar para revisión', help: 'Quedan marcados en Pagos para decidir si se reembolsan o se conservan.' },
      { value: 'refund', label: 'Reembolsar automáticamente', help: 'Al anular el pedido, sus pagos aprobados pasan a reembolsados.' },
    ],
  },
  {
    field: 'payment_approval', icon: ShieldCheck, title: 'Quién aprueba pagos',
    footnote: 'Aplica a aprobar, rechazar y reembolsar. Registrar pagos sigue dependiendo del permiso de la sección Pagos.',
    options: [
      { value: 'section', label: 'Cualquier usuario con escritura en Pagos', help: 'Comportamiento estándar según los permisos por sección.' },
      { value: 'restricted', label: 'Solo usuarios habilitados', help: 'Solo superusuarios y usuarios con "Puede aprobar pagos".' },
    ],
  },
]

function PolicySettings() {
  const [config, setConfig] = useState(null)

  useEffect(() => {
    api.get('/users/config/').then(r => setConfig(r.data)).catch(() => setConfig({}))
  }, [])

  if (config === null) return <div className="loading" style={{ minHeight: 60 }}><div className="spinner" /></div>
  return POLICY_GROUPS.map(group => (
    <PolicyCard key={group.field} group={group} initial={config[group.field] || group.options[0].value} />
  ))
}

function PolicyCard({ group, initial }) {
  const [value, setValue] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(null)
  const Icon = group.icon

  const save = async (next) => {
    const previous = value
    setValue(next); setSaving(true); setMessage(null)
    try {
      await api.patch('/users/config/', { [group.field]: next })
      setMessage({ type: 'success', text: 'Guardado.' })
      setTimeout(() => setMessage(null), 3000)
    } catch (e) {
      setValue(previous)
      setMessage({ type: 'danger', text: e.response?.data?.error || 'Error al guardar' })
    } finally { setSaving(false) }
  }

  return (
    <div className="card" style={{ maxWidth: 600, marginTop: 20 }}>
      <div style={{ padding: '20px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <Icon size={16} style={{ color: 'var(--accent)' }} />
          <span style={{ fontWeight: 600, fontSize: 14 }}>{group.title}</span>
        </div>

        {message && <div className={`alert alert-${message.type}`} style={{ marginBottom: 16 }}>{message.text}</div>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {group.options.map(o => (
            <label key={o.value} style={{
              display: 'flex', gap: 10, padding: 12, borderRadius: 8, cursor: saving ? 'wait' : 'pointer',
              border: `1px solid ${value === o.value ? 'var(--accent)' : 'var(--border)'}`,
              background: value === o.value ? 'var(--accent-glow)' : 'transparent',
            }}>
              <input type="radio" name={group.field} value={o.value} checked={value === o.value}
                disabled={saving} onChange={() => save(o.value)}
                style={{ accentColor: 'var(--accent)', marginTop: 2 }} />
              <div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{o.label}</div>
                <div className="text-muted text-sm">{o.help}</div>
              </div>
            </label>
          ))}
        </div>

        {group.footnote && <p className="text-muted text-sm" style={{ marginTop: 12 }}>{group.footnote}</p>}
      </div>
    </div>
  )
}
