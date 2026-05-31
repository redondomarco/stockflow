import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { ordersApi, zonesApi } from '../services/api'

const ROSARIO = [-32.9468, -60.6393]
const ZOOM = 13

export default function MapPage() {
  const mapDiv = useRef(null)
  const mapRef = useRef(null)
  const layerRef = useRef(null)
  const [customers, setCustomers] = useState([])
  const [zones, setZones] = useState([])
  const [filterZone, setFilterZone] = useState('')
  const [loading, setLoading] = useState(true)
  const [mapReady, setMapReady] = useState(false)

  useEffect(() => {
    Promise.all([ordersApi.customers(), zonesApi.list()])
      .then(([c, z]) => {
        setCustomers(c.data || [])
        setZones(z.data || [])
      })
      .finally(() => setLoading(false))
  }, [])

  // Init map once data is loaded
  useEffect(() => {
    if (loading || mapRef.current) return
    const map = L.map(mapDiv.current, { center: ROSARIO, zoom: ZOOM })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map)
    layerRef.current = L.layerGroup().addTo(map)
    mapRef.current = map
    setMapReady(true)
    return () => { map.remove(); mapRef.current = null; setMapReady(false) }
  }, [loading])

  // Update markers on filter or data change
  useEffect(() => {
    if (!mapReady || !layerRef.current) return
    layerRef.current.clearLayers()

    const visible = customers.filter(c =>
      c.latitude && c.longitude &&
      (!filterZone || String(c.zone) === filterZone)
    )

    visible.forEach(c => {
      const zone = zones.find(z => z.id === c.zone)
      const color = zone?.color || '#6366f1'
      const addr = [c.address, c.localidad].filter(Boolean).join(', ')
      const marker = L.circleMarker(
        [parseFloat(c.latitude), parseFloat(c.longitude)],
        { radius: 9, fillColor: color, color: '#fff', weight: 2, fillOpacity: 0.9 }
      )
      marker.bindPopup(`
        <div style="min-width:160px;font-family:sans-serif;font-size:13px">
          <strong>${c.name}</strong><br/>
          ${addr ? `<span style="color:#888">${addr}</span><br/>` : ''}
          ${c.phone ? `📞 ${c.phone}<br/>` : ''}
          ${c.cuit ? `CUIT: ${c.cuit}<br/>` : ''}
          ${zone ? `<span style="color:${color}">● ${zone.name}</span>` : ''}
        </div>
      `)
      layerRef.current.addLayer(marker)
    })
  }, [mapReady, customers, zones, filterZone])

  const withCoords = customers.filter(c => c.latitude && c.longitude)
  const filtered = withCoords.filter(c => !filterZone || String(c.zone) === filterZone)

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Mapa de clientes</h1>
          <p className="page-subtitle">
            {loading ? 'Cargando...' : `${filtered.length} cliente${filtered.length !== 1 ? 's' : ''} con ubicación${withCoords.length !== filtered.length ? ` (${withCoords.length} en total)` : ''}`}
          </p>
        </div>
        <select className="form-select" style={{ width: 200 }} value={filterZone} onChange={e => setFilterZone(e.target.value)}>
          <option value="">Todas las zonas</option>
          {zones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
        </select>
      </div>

      <div className="page-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Legend */}
        {zones.length > 0 && (
          <div className="card" style={{ padding: '10px 16px', display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <span className="text-muted text-sm">Zonas:</span>
            {zones.map(z => (
              <span key={z.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', opacity: filterZone && filterZone !== String(z.id) ? 0.4 : 1 }}
                onClick={() => setFilterZone(filterZone === String(z.id) ? '' : String(z.id))}>
                <span style={{ width: 12, height: 12, borderRadius: '50%', background: z.color, flexShrink: 0 }} />
                {z.name}
                <span className="mono text-muted text-xs">({customers.filter(c => c.latitude && c.longitude && String(c.zone) === String(z.id)).length})</span>
              </span>
            ))}
            <span style={{ fontSize: 13, cursor: 'pointer', color: 'var(--text-muted)' }}
              onClick={() => setFilterZone('')}>
              ● Sin zona
              <span className="mono text-muted text-xs" style={{ marginLeft: 4 }}>({customers.filter(c => c.latitude && c.longitude && !c.zone).length})</span>
            </span>
          </div>
        )}

        {/* Map */}
        <div className="card" style={{ padding: 0, overflow: 'hidden', flex: 1 }}>
          <div ref={mapDiv} style={{ height: 'calc(100vh - 240px)', minHeight: 400 }} />
        </div>
      </div>
    </>
  )
}
