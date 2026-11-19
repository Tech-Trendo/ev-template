import math

from django.conf import settings
from django.db import models
from django.utils.html import strip_tags
from django.utils.text import slugify
from django.utils import timezone


class Tag(models.Model):
    name = models.CharField(max_length=60, unique=True)
    slug = models.SlugField(max_length=80, unique=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        if not self.slug:
            base = slugify(self.name) or "tag"
            slug = base
            n = 1
            while Tag.objects.filter(slug=slug).exclude(pk=self.pk).exists():
                n += 1
                slug = f"{base}-{n}"
            self.slug = slug
        super().save(*args, **kwargs)


class Story(models.Model):
    STATUS_DRAFT = "draft"
    STATUS_PUBLISHED = "published"
    STATUS_ARCHIVED = "archived"
    STATUS_CHOICES = [
        (STATUS_DRAFT, "Draft"),
        (STATUS_PUBLISHED, "Published"),
        (STATUS_ARCHIVED, "Archived"),
    ]
    WORDS_PER_MINUTE = 200

    title = models.CharField(max_length=200)
    slug = models.SlugField(max_length=220, unique=True, blank=True)
    excerpt = models.TextField(blank=True)
    content = models.TextField(blank=True, help_text="Sanitized rich text HTML.")
    category = models.CharField(max_length=100, blank=True)

    image = models.ImageField(upload_to="stories/", blank=True, null=True)
    image_url = models.URLField(blank=True)
    alt_text = models.CharField(max_length=200, blank=True)

    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="stories",
        null=True,
        blank=True,
    )
    author_role = models.CharField(max_length=120, blank=True)
    author_bio = models.TextField(blank=True)
    author_photo = models.ImageField(upload_to="stories/authors/", blank=True, null=True)
    author_photo_url = models.URLField(blank=True)

    published_date = models.DateField(default=timezone.localdate)
    status = models.CharField(
        max_length=20, choices=STATUS_CHOICES, default=STATUS_DRAFT, db_index=True
    )
    reading_time_override = models.PositiveSmallIntegerField(null=True, blank=True)
    is_featured = models.BooleanField(default=False)
    sort_order = models.PositiveIntegerField(default=0)

    seo_title = models.CharField(max_length=200, blank=True)
    seo_description = models.TextField(blank=True)
    og_image = models.ImageField(upload_to="stories/og/", blank=True, null=True)
    og_image_url = models.URLField(blank=True)

    tags = models.ManyToManyField(Tag, blank=True, related_name="stories")

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["sort_order", "-published_date", "-id"]
        verbose_name_plural = "stories"

    def __str__(self):
        return self.title

    def save(self, *args, **kwargs):
        # Defense-in-depth: content is always stored sanitized, regardless of writer
        from .sanitizer import sanitize_html

        self.content = sanitize_html(self.content)
        if not self.slug:
            base = slugify(self.title)[:220] or "story"
            slug = base
            n = 1
            while Story.objects.filter(slug=slug).exclude(pk=self.pk).exists():
                n += 1
                slug = f"{base}-{n}"[:220]
            self.slug = slug
        super().save(*args, **kwargs)

    @property
    def is_published(self):
        return self.status == self.STATUS_PUBLISHED

    @property
    def reading_time(self):
        if self.reading_time_override:
            return self.reading_time_override
        text = strip_tags(self.content or "") or self.excerpt or ""
        words = len(text.split())
        if words == 0:
            return 1
        return max(1, math.ceil(words / self.WORDS_PER_MINUTE))

    @property
    def image_src(self):
        if self.image and hasattr(self.image, "url"):
            return self.image.url
        return self.image_url or ""

    @property
    def author_photo_src(self):
        if self.author_photo and hasattr(self.author_photo, "url"):
            return self.author_photo.url
        return self.author_photo_url or ""

    @property
    def og_image_src(self):
        if self.og_image and hasattr(self.og_image, "url"):
            return self.og_image.url
        return self.og_image_url or ""

    @property
    def seo_image_src(self):
        return self.og_image_src or self.image_src

    @property
    def author_name(self):
        if self.author_id and self.author:
            return self.author.get_full_name() or self.author.username
        return ""
