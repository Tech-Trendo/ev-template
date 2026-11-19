from django.contrib import admin

from .models import Role, UserProfile


class UserProfileInline(admin.StackedInline):
    model = UserProfile
    can_delete = False
    filter_horizontal = ("roles",)
    extra = 0


@admin.register(Role)
class RoleAdmin(admin.ModelAdmin):
    list_display = ("name", "description", "user_count")
    search_fields = ("name",)
    filter_horizontal = ("permissions",)


@admin.register(UserProfile)
class UserProfileAdmin(admin.ModelAdmin):
    list_display = ("user", "dealer", "role_list", "updated_at")
    list_filter = ("roles", "dealer")
    search_fields = ("user__username", "user__email")
    filter_horizontal = ("roles",)

    def role_list(self, obj):
        return ", ".join(r.name for r in obj.roles.all())
    role_list.short_description = "Roles"
