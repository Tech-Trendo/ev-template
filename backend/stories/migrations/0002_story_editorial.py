# Manual migration: expand Story into full editorial model.
# Preserves existing rows: is_published -> status, slugs backfilled from titles.

import django.utils.timezone
from django.db import migrations, models
from django.conf import settings
from django.utils.text import slugify


def forwards(apps, schema_editor):
    Story = apps.get_model("stories", "Story")
    for story in Story.objects.all():
        if story.is_published:
            story.status = "published"
        if not story.slug:
            base = slugify(story.title)[:220] or f"story-{story.pk}"
            slug = base
            n = 1
            while Story.objects.filter(slug=slug).exclude(pk=story.pk).exists():
                n += 1
                slug = f"{base}-{n}"[:220]
            story.slug = slug
        story.save(update_fields=["status", "slug"])


def backwards(apps, schema_editor):
    Story = apps.get_model("stories", "Story")
    Story.objects.update(is_published=models.Value(True))


class Migration(migrations.Migration):

    dependencies = [
        ("stories", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="story",
            name="slug",
            field=models.SlugField(blank=True, max_length=220, db_index=False),
        ),
        migrations.AddField(
            model_name="story",
            name="content",
            field=models.TextField(blank=True, help_text="Sanitized rich text HTML."),
        ),
        migrations.AddField(
            model_name="story",
            name="alt_text",
            field=models.CharField(blank=True, max_length=200),
        ),
        migrations.AddField(
            model_name="story",
            name="author",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="stories",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AddField(
            model_name="story",
            name="author_role",
            field=models.CharField(blank=True, max_length=120),
        ),
        migrations.AddField(
            model_name="story",
            name="author_bio",
            field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name="story",
            name="author_photo",
            field=models.ImageField(blank=True, null=True, upload_to="stories/authors/"),
        ),
        migrations.AddField(
            model_name="story",
            name="author_photo_url",
            field=models.URLField(blank=True),
        ),
        migrations.AddField(
            model_name="story",
            name="status",
            field=models.CharField(
                choices=[
                    ("draft", "Draft"),
                    ("published", "Published"),
                    ("archived", "Archived"),
                ],
                db_index=True,
                default="draft",
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="story",
            name="reading_time_override",
            field=models.PositiveSmallIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="story",
            name="is_featured",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="story",
            name="sort_order",
            field=models.PositiveIntegerField(default=0),
        ),
        migrations.AddField(
            model_name="story",
            name="seo_title",
            field=models.CharField(blank=True, max_length=200),
        ),
        migrations.AddField(
            model_name="story",
            name="seo_description",
            field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name="story",
            name="og_image",
            field=models.ImageField(blank=True, null=True, upload_to="stories/og/"),
        ),
        migrations.AddField(
            model_name="story",
            name="og_image_url",
            field=models.URLField(blank=True),
        ),
        migrations.AddField(
            model_name="story",
            name="updated_at",
            field=models.DateTimeField(auto_now=True),
        ),
        migrations.AlterModelOptions(
            name="story",
            options={
                "ordering": ["sort_order", "-published_date", "-id"],
                "verbose_name_plural": "stories",
            },
        ),
        migrations.AlterField(
            model_name="story",
            name="published_date",
            field=models.DateField(default=django.utils.timezone.localdate),
        ),
        # Tag table + M2M (Tag model added in same migration)
        migrations.CreateModel(
            name="Tag",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("name", models.CharField(max_length=60, unique=True)),
                ("slug", models.SlugField(blank=True, max_length=80, unique=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
            ],
            options={
                "ordering": ["name"],
            },
        ),
        migrations.AddField(
            model_name="story",
            name="tags",
            field=models.ManyToManyField(blank=True, related_name="stories", to="stories.tag"),
        ),
        # Data: preserve publication state + backfill slugs
        migrations.RunPython(forwards, backwards),
        migrations.RemoveField(
            model_name="story",
            name="is_published",
        ),
        # Unique constraint only after slugs are populated (SQLite table rebuild)
        migrations.AlterField(
            model_name="story",
            name="slug",
            field=models.SlugField(blank=True, max_length=220, unique=True),
        ),
    ]
