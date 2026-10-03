"""Períodos mensuales para los tableros (?month=AAAA-MM, en hora local)."""
import re
from datetime import datetime

from django.utils import timezone

from .services import BusinessRuleError

MONTH_RE = re.compile(r'^(\d{4})-(\d{2})$')


def month_bounds(year, month):
    """(inicio, fin) del mes como datetimes con zona horaria local; fin excluido."""
    tz = timezone.get_current_timezone()
    start = timezone.make_aware(datetime(year, month, 1), tz)
    end = timezone.make_aware(datetime(year + month // 12, month % 12 + 1, 1), tz)
    return start, end


def month_range(value):
    """'AAAA-MM' → (inicio, fin), o None si no se pidió un mes."""
    if not value:
        return None
    match = MONTH_RE.match(value)
    if not match or not 1 <= int(match.group(2)) <= 12:
        raise BusinessRuleError(f'Mes inválido: "{value}" (formato AAAA-MM).')
    return month_bounds(int(match.group(1)), int(match.group(2)))


def last_months(count):
    """Los últimos `count` meses hasta el actual (inclusive), del más viejo al más nuevo: [(año, mes)]."""
    today = timezone.localdate()
    months = []
    year, month = today.year, today.month
    for _ in range(count):
        months.append((year, month))
        year, month = (year - 1, 12) if month == 1 else (year, month - 1)
    return list(reversed(months))
