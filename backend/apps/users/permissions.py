from rest_framework.permissions import BasePermission

READ_METHODS = ('GET', 'HEAD', 'OPTIONS')


class SectionPermission(BasePermission):
    """
    Add `permission_section = '<section>'` to a ViewSet to enforce
    per-user section-level access (hidden / read / write).
    Superusers always pass.
    """

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.user.is_superuser:
            return True
        section = getattr(view, 'permission_section', None)
        if not section:
            return True
        profile = getattr(request.user, 'profile', None)
        if not profile:
            return True
        level = profile.get_level(section)
        if level == 'hidden':
            return False
        if level == 'read' and request.method not in READ_METHODS:
            return False
        return True
