from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from .models import Story, Tag
from .sanitizer import sanitize_html

User = get_user_model()


def get_admin_client():
    User.objects.filter(username="testadmin").delete()
    admin = User.objects.create_superuser("testadmin", "admin@test.com", "pass12345")
    refresh = RefreshToken.for_user(admin)
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {str(refresh.access_token)}")
    return client, admin


def get_regular_client():
    User.objects.filter(username="regular").delete()
    user = User.objects.create_user("regular", "regular@test.com", "pass12345")
    refresh = RefreshToken.for_user(user)
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {str(refresh.access_token)}")
    return client, user


def make_story(**kwargs):
    defaults = {
        "title": "First VT fleet crosses the Himalayas",
        "excerpt": "Three AOCHI 10T units completed a loaded Kathmandu-Pokhara run.",
        "content": "<p>Electric torque conquered the hills.</p>",
        "category": "Field Report",
        "published_date": "2025-11-14",
        "status": Story.STATUS_PUBLISHED,
    }
    defaults.update(kwargs)
    return Story.objects.create(**defaults)


class StoryCrudTests(TestCase):
    def setUp(self):
        self.client, self.admin = get_admin_client()

    def test_create_story(self):
        payload = {
            "title": "New charging hub opens",
            "excerpt": "Fast chargers now live in Lalitpur.",
            "content": "<p>Hello <strong>world</strong></p>",
            "category": "News",
            "published_date": "2026-01-10",
            "status": "draft",
            "tags": ["Charging", "Nepal"],
        }
        resp = self.client.post("/api/stories/", payload, format="json")
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data["slug"], "new-charging-hub-opens")
        self.assertEqual(resp.data["author_detail"]["name"], "testadmin")
        self.assertEqual(sorted(t["name"] for t in resp.data["tags_display"]), ["Charging", "Nepal"])
        story = Story.objects.get(slug="new-charging-hub-opens")
        self.assertEqual(story.status, Story.STATUS_DRAFT)

    def test_retrieve_update_delete(self):
        story = make_story(author=self.admin)
        resp = self.client.get(f"/api/stories/{story.slug}/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["title"], story.title)

        resp = self.client.patch(
            f"/api/stories/{story.id}/", {"title": "Updated title"}, format="json"
        )
        self.assertEqual(resp.status_code, 200)
        # Slug must NOT change when title changes (URL stability)
        story.refresh_from_db()
        self.assertEqual(story.title, "Updated title")
        self.assertEqual(story.slug, "first-vt-fleet-crosses-the-himalayas")

        resp = self.client.delete(f"/api/stories/{story.id}/")
        self.assertEqual(resp.status_code, 204)
        self.assertFalse(Story.objects.filter(pk=story.pk).exists())

    def test_duplicate_slug_gets_suffix(self):
        a = make_story()
        b = make_story(title="First VT Fleet Crosses The Himalayas!")
        self.assertNotEqual(a.slug, b.slug)
        self.assertTrue(b.slug.startswith(a.slug))


class PublishingTests(TestCase):
    def setUp(self):
        self.client, self.admin = get_admin_client()

    def test_draft_not_public(self):
        draft = make_story(status=Story.STATUS_DRAFT)
        pub = make_story(title="Visible one", slug="visible-one")
        anon = APIClient()

        resp = anon.get("/api/stories/")
        titles = [s["title"] for s in resp.data]
        self.assertIn(pub.title, titles)
        self.assertNotIn(draft.title, titles)

        resp = anon.get(f"/api/stories/{draft.slug}/")
        self.assertEqual(resp.status_code, 404)

        resp = anon.get(f"/api/stories/{pub.slug}/")
        self.assertEqual(resp.status_code, 200)

    def test_unpublish_removes_from_public(self):
        story = make_story()
        anon = APIClient()
        resp = anon.post(f"/api/stories/{story.id}/unpublish/")
        self.assertEqual(resp.status_code, 401)  # anonymous cannot unpublish

        resp = self.client.post(f"/api/stories/{story.id}/unpublish/")
        self.assertEqual(resp.data["status"], Story.STATUS_DRAFT)
        resp = anon.get("/api/stories/")
        self.assertEqual(len(resp.data), 0)

        resp = self.client.post(f"/api/stories/{story.id}/publish/")
        self.assertEqual(resp.data["status"], Story.STATUS_PUBLISHED)
        resp = anon.get("/api/stories/")
        self.assertEqual(len(resp.data), 1)

    def test_archived_not_public(self):
        make_story(status=Story.STATUS_ARCHIVED)
        anon = APIClient()
        resp = anon.get("/api/stories/")
        self.assertEqual(len(resp.data), 0)

    def test_staff_all_param_sees_drafts(self):
        make_story(status=Story.STATUS_DRAFT)
        resp = self.client.get("/api/stories/?all=1")
        self.assertEqual(len(resp.data), 1)


class SlugLookupTests(TestCase):
    def setUp(self):
        self.client, _ = get_admin_client()

    def test_slug_lookup_public(self):
        story = make_story(slug="himalaya-run")
        anon = APIClient()
        resp = anon.get("/api/stories/himalaya-run/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["id"], story.id)

    def test_invalid_slug_returns_404(self):
        resp = APIClient().get("/api/stories/no-such-story-exists/")
        self.assertEqual(resp.status_code, 404)

    def test_numeric_id_lookup_for_admin(self):
        story = make_story()
        resp = self.client.get(f"/api/stories/{story.id}/?all=1")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["id"], story.id)


class RichContentTests(TestCase):
    def setUp(self):
        self.client, _ = get_admin_client()

    def test_content_round_trip(self):
        html = (
            "<h2>Cost</h2><table><tr><th>Item</th></tr><tr><td>Fuel</td></tr></table>"
            "<blockquote>We did not change our loading plan.</blockquote>"
            "<ul><li>One</li><li>Two</li></ul>"
        )
        resp = self.client.post(
            "/api/stories/",
            {
                "title": "Round trip",
                "content": html,
                "published_date": "2026-01-01",
                "status": "draft",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 201)
        story = Story.objects.get(pk=resp.data["id"])
        for fragment in ("<h2>", "<table>", "<blockquote>", "<ul>"):
            self.assertIn(fragment, story.content)

    def test_unsafe_content_sanitized_on_save(self):
        dirty = (
            '<p onclick="evil()">hi</p>'
            '<script>alert(1)</script>'
            '<a href="javascript:alert(2)">x</a>'
            '<iframe src="http://evil"></iframe>'
            '<img src="/media/stories/content/ok.png" onerror="bad()">'
        )
        story = make_story(content=dirty, title="Dirty")
        clean = story.content
        self.assertNotIn("<script", clean)
        self.assertNotIn("onclick", clean)
        self.assertNotIn("onerror", clean)
        self.assertNotIn("javascript:", clean)
        self.assertNotIn("<iframe", clean)
        self.assertIn("<p>hi</p>", clean)
        self.assertIn('src="/media/stories/content/ok.png"', clean)

    def test_sanitizer_unit(self):
        self.assertEqual(sanitize_html('<b style="x">a</b><em>c</em>'), "<b>a</b><em>c</em>")
        self.assertEqual(sanitize_html("plain text"), "plain text")

    def test_reading_time_auto(self):
        words = " ".join(["word"] * 400)  # ~2 min at 200 wpm
        story = make_story(content=f"<p>{words}</p>")
        self.assertEqual(story.reading_time, 2)
        story.reading_time_override = 7
        self.assertEqual(story.reading_time, 7)


class PermissionTests(TestCase):
    def setUp(self):
        self.admin_client, self.admin = get_admin_client()
        self.user_client, _user = get_regular_client()
        self.story = make_story(author=self.admin)

    def test_anonymous_cannot_write(self):
        anon = APIClient()
        self.assertEqual(anon.post("/api/stories/", {}, format="json").status_code, 401)
        self.assertEqual(
            anon.patch(f"/api/stories/{self.story.id}/", {}, format="json").status_code, 401
        )
        self.assertEqual(anon.delete(f"/api/stories/{self.story.id}/").status_code, 401)

    def test_non_staff_cannot_write(self):
        self.assertEqual(
            self.user_client.post("/api/stories/", {}, format="json").status_code, 403
        )
        self.assertEqual(
            self.user_client.delete(f"/api/stories/{self.story.id}/").status_code, 403
        )

    def test_anonymous_can_read_published_only(self):
        make_story(title="Draft thing", slug="draft-thing", status=Story.STATUS_DRAFT)
        anon = APIClient()
        self.assertEqual(anon.get("/api/stories/").status_code, 200)
        self.assertEqual(anon.get(f"/api/stories/{self.story.slug}/").status_code, 200)
        self.assertEqual(anon.get("/api/stories/draft-thing/").status_code, 404)

    def test_admin_full_lifecycle(self):
        resp = self.admin_client.post(
            "/api/stories/",
            {"title": "Lifecycle", "published_date": "2026-02-02", "status": "draft"},
            format="json",
        )
        sid = resp.data["id"]
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(self.admin_client.patch(f"/api/stories/{sid}/", {"excerpt": "e"}, format="json").status_code, 200)
        self.assertEqual(self.admin_client.post(f"/api/stories/{sid}/publish/").status_code, 200)
        self.assertEqual(self.admin_client.delete(f"/api/stories/{sid}/").status_code, 204)


class FilteringTests(TestCase):
    def setUp(self):
        self.client, _ = get_admin_client()
        self.report = make_story(category="Field Report", slug="report-one")
        tech = make_story(title="Battery at altitude", category="Technology", slug="tech-one")
        tech.tags.add(Tag.objects.create(name="AOCHI 10T"))
        make_story(title="Old event recap", category="Events", slug="event-one", published_date="2024-05-01")

    def test_filter_category(self):
        resp = APIClient().get("/api/stories/?category=Field Report")
        self.assertEqual(len(resp.data), 1)
        self.assertEqual(resp.data[0]["slug"], "report-one")

    def test_filter_tag(self):
        resp = APIClient().get("/api/stories/?tag=AOCHI 10T")
        self.assertEqual(len(resp.data), 1)
        self.assertEqual(resp.data[0]["slug"], "tech-one")

    def test_search_title_and_author(self):
        resp = APIClient().get("/api/stories/?search=battery")
        self.assertEqual(len(resp.data), 1)
        resp = APIClient().get(f"/api/stories/?search={self.report.author_name}")
        self.assertGreaterEqual(len(resp.data), 1)

    def test_date_range(self):
        resp = APIClient().get("/api/stories/?date_from=2025-01-01&date_to=2026-12-31")
        slugs = [s["slug"] for s in resp.data]
        self.assertIn("report-one", slugs)
        self.assertNotIn("event-one", slugs)

    def test_status_filter_staff_only_view(self):
        resp = self.client.get("/api/stories/?all=1&status=draft")
        self.assertEqual(len(resp.data), 0)

    def test_categories_action(self):
        resp = APIClient().get("/api/stories/categories/")
        self.assertEqual(resp.status_code, 200)
        self.assertIn("Field Report", resp.data)


class RelatedAndPaginationTests(TestCase):
    def setUp(self):
        self.client, _ = get_admin_client()
        tag = Tag.objects.create(name="Fleet Ops")
        self.base = make_story(slug="base")
        self.base.tags.add(tag)
        same_tag = make_story(title="Shared tag story", slug="shared-tag", published_date="2025-09-01")
        same_tag.tags.add(tag)
        make_story(title="Same category", slug="same-cat", excerpt="", content="<p>x</p>", published_date="2025-08-20")
        make_story(title="Unrelated", slug="unrelated", category="Technology", published_date="2025-08-15")

    def test_related_excludes_self_and_prefers_tags_category(self):
        resp = APIClient().get("/api/stories/base/related/")
        slugs = [s["slug"] for s in resp.data]
        self.assertNotIn("base", slugs)
        self.assertIn("shared-tag", slugs)
        self.assertIn("same-cat", slugs)

    def test_pagination_envelope(self):
        resp = APIClient().get("/api/stories/?page=1&page_size=2")
        self.assertEqual(resp.data["count"], 4)
        self.assertEqual(resp.data["page_size"], 2)
        self.assertEqual(len(resp.data["results"]), 2)
        self.assertEqual(resp.data["total_pages"], 2)

    def test_prev_next_in_retrieve(self):
        make_story(slug="newer", published_date="2025-12-01", title="Newer story")
        make_story(slug="older", published_date="2025-10-01", title="Older story")
        resp = APIClient().get("/api/stories/base/")
        self.assertEqual(resp.data["next"]["slug"], "newer")
        self.assertEqual(resp.data["previous"]["slug"], "older")


class UploadImageTests(TestCase):
    def setUp(self):
        self.client, _ = get_admin_client()

    def test_upload_requires_auth(self):
        png = SimpleUploadedFile("t.png", b"\x89PNG\r\n\x1a\n", content_type="image/png")
        resp = APIClient().post("/api/stories/upload_image/", {"image": png}, format="multipart")
        self.assertEqual(resp.status_code, 401)

    def test_upload_returns_url(self):
        from django.conf import settings as dj_settings
        import os

        png = SimpleUploadedFile("t.png", b"\x89PNG\r\n\x1a\n", content_type="image/png")
        resp = self.client.post(
            "/api/stories/upload_image/", {"image": png, "alt": "convoy"}, format="multipart"
        )
        self.assertEqual(resp.status_code, 201)
        self.assertIn("/media/stories/content/", resp.data["url"])
        self.assertEqual(resp.data["alt"], "convoy")
        stored = os.path.join(dj_settings.MEDIA_ROOT, "stories/content")
        if os.path.isdir(stored):
            for f in os.listdir(stored):
                os.remove(os.path.join(stored, f))

    def test_upload_without_file_400(self):
        resp = self.client.post("/api/stories/upload_image/", {})
        self.assertEqual(resp.status_code, 400)
