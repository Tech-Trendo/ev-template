"""Attendance access rules.

Records: any active authenticated user may list their OWN records.
Viewing other users' records, manual corrections, and CSV export need
``attendance.view_attendancerecord`` / ``manage_attendance``.
"""

from rest_framework.permissions import BasePermission

from accounts.models import user_has_perm, user_is_super_admin


def can_manage(user):
    if not user or not user.is_authenticated or not user.is_active:
        return False
    if user.is_superuser or user_is_super_admin(user):
        return True
    return user_has_perm(user, "attendance.manage_attendance")


def can_view_all(user):
    if not user or not user.is_authenticated or not user.is_active:
        return False
    if user.is_superuser or user_is_super_admin(user):
        return True
    return user_has_perm(user, "attendance.view_attendancerecord") or user_has_perm(
        user, "attendance.manage_attendance"
    )


class AttendanceRecordPermission(BasePermission):
    def has_permission(self, request, view):
        user = getattr(request, "user", None)
        if not user or not user.is_authenticated or not user.is_active:
            return False
        action = getattr(view, "action", None)
        if action == "export":
            return can_manage(user)
        if request.method in ("GET", "HEAD", "OPTIONS"):
            return True  # queryset scopes non-managers to their own rows
        return can_manage(user)

    def has_object_permission(self, request, view, obj):
        user = request.user
        if can_view_all(user):
            return True
        return obj.user_id == user.pk and request.method in ("GET", "HEAD", "OPTIONS")
