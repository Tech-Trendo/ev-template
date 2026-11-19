from django.contrib import admin

from .models import Story, Tag


@admin.register(Story)
class StoryAdmin(admin.ModelAdmin):
    list_display = (
        "title",
        "category",
        "author_name",
        "status",
        "published_date",
        "is_featured",
        "reading_time",
    )
    list_filter = ("status", "category", "is_featured")
    search_fields = ("title", "excerpt", "category", "author__username", "author__first_name", "author__last_name")
    date_hierarchy = "published_date"
    prepopulated_fields = {"slug": ("title",)}
    filter_horizontal = ("tags",)


@admin.register(Tag)
class TagAdmin(admin.ModelAdmin):
    list_display = ("name", "slug")
    search_fields = ("name",)
