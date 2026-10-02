"""Favicon configurable: validación del archivo subido y respuesta pública."""
import base64
import binascii
import hashlib
import re

from django.http import HttpResponse, HttpResponseNotModified

ALLOWED_TYPES = {'image/svg+xml', 'image/png', 'image/x-icon', 'image/vnd.microsoft.icon'}
MAX_BYTES = 100 * 1024
DATA_URL_RE = re.compile(r'^data:([\w.+/-]+);base64,([A-Za-z0-9+/=\s]+)$')

# Ícono por defecto (sin favicon configurado): iniciales SF sobre el color de acento
DEFAULT_SVG = (
    b'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">'
    b'<rect width="64" height="64" rx="14" fill="#7c6af7"/>'
    b'<text x="32" y="42" font-family="Arial,Helvetica,sans-serif" font-size="28" '
    b'font-weight="700" text-anchor="middle" fill="#fff">SF</text></svg>'
)


class FaviconError(ValueError):
    pass


def parse_favicon(data_url):
    """Devuelve (mime, bytes) de un data URL válido o lanza FaviconError."""
    match = DATA_URL_RE.match(data_url or '')
    if not match:
        raise FaviconError('El favicon debe ser una imagen SVG, PNG o ICO.')
    mime, payload = match.group(1).lower(), match.group(2)
    if mime not in ALLOWED_TYPES:
        raise FaviconError('Formato no admitido: usá SVG, PNG o ICO.')
    try:
        content = base64.b64decode(payload, validate=False)
    except (binascii.Error, ValueError):
        raise FaviconError('El archivo del favicon está dañado.')
    if not content:
        raise FaviconError('El archivo del favicon está vacío.')
    if len(content) > MAX_BYTES:
        raise FaviconError(f'El favicon no puede superar {MAX_BYTES // 1024} KB.')
    return mime, content


def favicon_response(request, data_url):
    """Respuesta HTTP del favicon (o del ícono por defecto), con ETag para revalidar barato."""
    try:
        mime, content = parse_favicon(data_url) if data_url else ('image/svg+xml', DEFAULT_SVG)
    except FaviconError:
        mime, content = 'image/svg+xml', DEFAULT_SVG
    etag = '"%s"' % hashlib.sha256(content).hexdigest()[:32]
    if request.headers.get('If-None-Match') == etag:
        response = HttpResponseNotModified()
    else:
        response = HttpResponse(content, content_type=mime)
    response['ETag'] = etag
    response['Cache-Control'] = 'no-cache'  # el navegador revalida con el ETag
    # Un SVG abierto directamente no debe poder ejecutar scripts en el dominio de la app
    response['Content-Security-Policy'] = "default-src 'none'; style-src 'unsafe-inline'; sandbox"
    response['X-Content-Type-Options'] = 'nosniff'
    return response
