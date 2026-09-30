from django.db.models import ProtectedError
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler


def exception_handler(exc, context):
    """Agrega a DRF el caso de borrar un registro referenciado (on_delete=PROTECT): 400 en vez de 500."""
    if isinstance(exc, ProtectedError):
        related = sorted({obj._meta.verbose_name for obj in exc.protected_objects})
        return Response(
            {'error': f'No se puede eliminar porque tiene registros asociados ({", ".join(related)}). '
                      'Desactivalo en su lugar.'},
            status=400,
        )
    return drf_exception_handler(exc, context)
