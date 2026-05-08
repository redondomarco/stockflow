import { createContext, useContext, useState, useEffect } from 'react'
import api from '../services/api'

const ConfigContext = createContext({ logoSvg: '', setLogoSvg: () => {} })

export function ConfigProvider({ children }) {
  const [logoSvg, setLogoSvg] = useState('')

  useEffect(() => {
    const token = localStorage.getItem('access_token')
    if (token) fetchConfig()
  }, [])

  const fetchConfig = () =>
    api.get('/users/config/').then(r => setLogoSvg(r.data.logo_svg || '')).catch(() => {})

  const refreshConfig = () => fetchConfig()

  return (
    <ConfigContext.Provider value={{ logoSvg, setLogoSvg, refreshConfig }}>
      {children}
    </ConfigContext.Provider>
  )
}

export const useConfig = () => useContext(ConfigContext)

export async function svgToPngDataUrl(svgString, w = 120, h = 60) {
  if (!svgString) return null
  return new Promise((resolve) => {
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = w * 2; canvas.height = h * 2
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/png'))
    }
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null) }
    img.src = url
  })
}
