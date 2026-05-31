import { createContext, useContext, useState, useEffect } from 'react'
import api from '../services/api'

const ConfigContext = createContext({ logoSvg: '', logoWidth: 140, pdfLogoWidth: 35 })

export function ConfigProvider({ children }) {
  const [logoSvg, setLogoSvg] = useState('')
  const [logoWidth, setLogoWidth] = useState(140)
  const [pdfLogoWidth, setPdfLogoWidth] = useState(35)

  useEffect(() => {
    const token = localStorage.getItem('access_token')
    if (token) fetchConfig()
  }, [])

  const fetchConfig = () =>
    api.get('/users/config/').then(r => {
      setLogoSvg(r.data.logo_svg || '')
      setLogoWidth(r.data.logo_width || 140)
      setPdfLogoWidth(r.data.pdf_logo_width || 35)
    }).catch(() => {})

  const refreshConfig = () => fetchConfig()

  return (
    <ConfigContext.Provider value={{ logoSvg, setLogoSvg, logoWidth, setLogoWidth, pdfLogoWidth, setPdfLogoWidth, refreshConfig }}>
      {children}
    </ConfigContext.Provider>
  )
}

export const useConfig = () => useContext(ConfigContext)

function getSvgRatio(svgString) {
  try {
    const doc = new DOMParser().parseFromString(svgString, 'image/svg+xml')
    const svg = doc.querySelector('svg')
    if (!svg) return 1
    const vb = svg.getAttribute('viewBox')
    if (vb) {
      const [, , w, h] = vb.trim().split(/[\s,]+/).map(parseFloat)
      if (w && h) return h / w
    }
    const w = parseFloat(svg.getAttribute('width'))
    const h = parseFloat(svg.getAttribute('height'))
    if (w && h) return h / w
  } catch {}
  return 1
}

// Returns { dataUrl, ratio } where ratio = height/width of the original SVG
export async function svgToPngDataUrl(svgString, pxWidth = 240) {
  if (!svgString) return null
  const ratio = getSvgRatio(svgString)
  const pxHeight = Math.round(pxWidth * ratio)
  return new Promise((resolve) => {
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = pxWidth * 2; canvas.height = pxHeight * 2
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      resolve({ dataUrl: canvas.toDataURL('image/png'), ratio, pxWidth })
    }
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null) }
    img.src = url
  })
}
