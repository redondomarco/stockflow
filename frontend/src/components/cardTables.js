// Vista opcional de tarjetas para las tablas en móvil (preferencia por dispositivo).
// El CSS (index.css, "Móvil: tablas como tarjetas") convierte cada fila en una tarjeta
// con pares "Columna: valor"; acá se marcan las tablas y se copia el encabezado de
// cada columna a sus celdas en data-label, así ninguna página necesita cambios.

const STORAGE_KEY = 'stockflow:mobile-view'

export function loadMobileView() {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'cards' ? 'cards' : 'table'
  } catch {
    return 'table'  // almacenamiento bloqueado (modo privado, etc.): tabla por defecto
  }
}

export function saveMobileView(view) {
  try { localStorage.setItem(STORAGE_KEY, view) } catch { /* sin persistencia */ }
}

// Solo las tablas principales de cada pantalla: no las de modales ni las anidadas
// (p. ej. los pagos desplegados dentro de cada pedido en Cuenta corriente).
function isMainTable(table) {
  return !table.closest('.modal') && !table.parentElement.closest('table')
}

export function labelTables(root) {
  root.querySelectorAll('.page-body table').forEach(table => {
    if (!isMainTable(table)) return
    table.setAttribute('data-card-table', '')

    const headers = []
    table.querySelectorAll(':scope > thead > tr:first-child > th').forEach(th => {
      for (let i = 0; i < (th.colSpan || 1); i++) headers.push(th.textContent.trim())
    })

    table.querySelectorAll(':scope > tbody > tr').forEach(tr => {
      let col = 0
      for (const td of tr.children) {
        // Celdas que abarcan varias columnas (estado vacío, fila desplegada): sin etiqueta
        const label = td.colSpan > 1 ? '' : (headers[col] || '')
        if (td.getAttribute('data-label') !== label) td.setAttribute('data-label', label)
        col += td.colSpan || 1
      }
    })
  })
}
