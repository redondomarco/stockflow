import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Search, X } from 'lucide-react'

// Fix Leaflet marker icons in Vite/webpack builds
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

const DEFAULT_LAT = -32.9468
const DEFAULT_LNG = -60.6393
const DEFAULT_ZOOM = 13

export default function MapPicker({ lat, lng, onConfirm, onClose }) {
  const mapDiv = useRef(null)
  const mapRef = useRef(null)
  const markerRef = useRef(null)
  const [coords, setCoords] = useState({
    lat: lat ? parseFloat(lat) : DEFAULT_LAT,
    lng: lng ? parseFloat(lng) : DEFAULT_LNG,
  })
  const [search, setSearch] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    if (mapRef.current) return
    const hasCoords = lat && lng
    const map = L.map(mapDiv.current, {
      center: [coords.lat, coords.lng],
      zoom: hasCoords ? 15 : DEFAULT_ZOOM,
    })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map)

    const marker = L.marker([coords.lat, coords.lng], { draggable: true }).addTo(map)
    marker.on('dragend', () => {
      const p = marker.getLatLng()
      setCoords({ lat: p.lat, lng: p.lng })
    })
    map.on('click', (e) => {
      marker.setLatLng(e.latlng)
      setCoords({ lat: e.latlng.lat, lng: e.latlng.lng })
    })

    mapRef.current = map
    markerRef.current = marker
    return () => { map.remove(); mapRef.current = null }
  }, [])

  const doSearch = async () => {
    if (!search.trim()) return
    setSearching(true)
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(search)}&format=json&limit=6&addressdetails=1`,
        { headers: { 'Accept-Language': 'es' } }
      )
      setResults(await res.json())
    } finally { setSearching(false) }
  }

  const pickResult = (r) => {
    const lat = parseFloat(r.lat), lng = parseFloat(r.lon)
    setCoords({ lat, lng })
    markerRef.current.setLatLng([lat, lng])
    mapRef.current.setView([lat, lng], 16)
    setResults([])
    setSearch(r.display_name.split(',').slice(0, 3).join(', '))
  }

  const confirm = () => onConfirm(coords.lat.toFixed(7), coords.lng.toFixed(7))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Search */}
      <div style={{ position: 'relative' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <div className="search-input" style={{ flex: 1 }}>
            <Search className="search-icon" size={14} />
            <input
              className="form-input"
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && doSearch()}
              placeholder="Buscar dirección..."
            />
          </div>
          <button className="btn btn-secondary" onClick={doSearch} disabled={searching}>
            {searching ? '...' : 'Buscar'}
          </button>
        </div>
        {results.length > 0 && (
          <div style={{
            position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 1000,
            background: 'var(--bg-card)', border: '1px solid var(--border-light)',
            borderRadius: 6, marginTop: 4, maxHeight: 200, overflowY: 'auto',
            boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
          }}>
            {results.map((r, i) => (
              <div key={i} onMouseDown={() => pickResult(r)}
                style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 12, borderBottom: i < results.length - 1 ? '1px solid var(--border)' : 'none' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                {r.display_name}
              </div>
            ))}
            <div style={{ padding: '4px 8px', textAlign: 'right' }}>
              <button className="btn btn-ghost btn-sm" onMouseDown={() => setResults([])}><X size={12} /></button>
            </div>
          </div>
        )}
      </div>

      {/* Map */}
      <div ref={mapDiv} style={{ height: 380, borderRadius: 8, border: '1px solid var(--border)', zIndex: 0 }} />

      {/* Coords + actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
          {coords.lat.toFixed(6)}, {coords.lng.toFixed(6)}
        </span>
        <span className="text-muted text-xs">Hacé click en el mapa o arrastrá el marcador</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={confirm}>Confirmar ubicación</button>
        </div>
      </div>
    </div>
  )
}
