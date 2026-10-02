import { useAuth } from '../context/AuthContext'
import { Info, Tag } from 'lucide-react'
import changelog from '@changelog?raw'

// Versión instalada: la graba `make deploy` (tag de git) al compilar
const APP_VERSION = import.meta.env.VITE_APP_VERSION || 'dev'

// CHANGELOG.md: "## vX.Y.Z — AAAA-MM-DD" seguido de ítems "- texto" (admite **negrita**)
export function parseChangelog(text) {
  const versions = []
  for (const line of text.split('\n')) {
    const header = line.match(/^##\s+(v?\d+\.\d+\.\d+)\s*(?:[—–-]\s*(\d{4}-\d{2}-\d{2}))?/)
    if (header) {
      versions.push({ version: header[1], date: header[2] || '', changes: [] })
    } else if (line.startsWith('- ') && versions.length) {
      versions[versions.length - 1].changes.push(line.slice(2).trim())
    }
  }
  // Más reciente primero, aunque el archivo tenga otro orden
  const key = v => v.version.replace(/^v/, '').split('.').map(Number)
  return versions.sort((a, b) => {
    const [x, y] = [key(a), key(b)]
    return y[0] - x[0] || y[1] - x[1] || y[2] - x[2]
  })
}

function RichText({ text }) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={i} style={{ color: 'var(--text)' }}>{part.slice(2, -2)}</strong>
      : part
  )
}

function fmtDate(iso) {
  if (!iso) return ''
  return new Date(iso + 'T12:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })
}

const versions = parseChangelog(changelog)

export default function AboutPage() {
  const { isAdmin } = useAuth()
  if (!isAdmin) {
    return (
      <div className="page-body">
        <div className="alert alert-danger">Esta pantalla solo está disponible para administradores.</div>
      </div>
    )
  }

  const installed = APP_VERSION.replace(/-dirty$/, '').split('-')[0]   // v1.0.10-3-gabc → v1.0.10
  const latest = versions[0]?.version

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Acerca de</h1>
          <p className="page-subtitle">Versión instalada e historial de cambios</p>
        </div>
      </div>

      <div className="page-body">
        <div className="card" style={{ marginBottom: 16, padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <Info size={22} style={{ color: 'var(--accent)' }} />
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontWeight: 700, fontSize: 16 }}>StockFlow</div>
            <div className="text-muted text-sm">Gestión de stock, pedidos, hojas de ruta y cobranzas</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="text-muted text-sm">Versión instalada</div>
            <div className="mono" style={{ fontWeight: 700, fontSize: 18, color: 'var(--accent)' }}>{APP_VERSION}</div>
          </div>
        </div>

        {latest && installed !== latest && APP_VERSION !== 'dev' && (
          <div className="alert alert-warning" style={{ marginBottom: 16 }}>
            La versión instalada ({APP_VERSION}) no coincide con la última del historial ({latest}).
          </div>
        )}

        {versions.map((v, i) => (
          <div key={v.version} className="card" style={{ marginBottom: 12, padding: '16px 24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
              <Tag size={15} style={{ color: 'var(--accent)' }} />
              <span className="mono" style={{ fontWeight: 700, fontSize: 15 }}>{v.version}</span>
              {v.date && <span className="text-muted text-sm">{fmtDate(v.date)}</span>}
              {i === 0 && <span className="badge badge-approved">Más reciente</span>}
              {v.version === installed && <span className="badge badge-confirmed">Instalada</span>}
            </div>
            <ul style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {v.changes.map((change, j) => (
                <li key={j} className="text-sm" style={{ color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  <RichText text={change} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </>
  )
}
