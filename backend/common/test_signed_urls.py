import gc
import time
from unittest import mock
from urllib.parse import parse_qs, urlsplit

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from accounts.models import UserProfile
from common.signed_urls import sign_private_url
from crm.models import Document
from dealers.models import Dealer

User = get_user_model()

PNG = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
    b"\x08\x06\x00\x00\x00\x1f\x15c4\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05"
    b"\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
)


def _remove_files(field_files):
    # Unconsumed FileResponses keep handles open until collected (Windows locks open files).
    gc.collect()
    for f in field_files:
        try:
            f.delete(save=False)
        except PermissionError:
            pass


class SignedPrivateUrlTests(APITestCase):
    def setUp(self):
        self.ho_user = User.objects.create_user("sig-ho", "sig-ho@example.test", "pw")
        for codename in ("view_document", "add_document", "change_document"):
            self.ho_user.user_permissions.add(Permission.objects.get(codename=codename))
        self.dealer_user = User.objects.create_user("sig-dealer", "sig-dealer@example.test", "pw")
        UserProfile.objects.create(user=self.dealer_user, dealer=Dealer.objects.create(name="Sig Motors"))
        self.dealer_user.user_permissions.add(Permission.objects.get(codename="view_document"))
        self.no_perm_user = User.objects.create_user("sig-none", "sig-none@example.test", "pw")

        self.auth(self.ho_user)
        resp = self.client.post(
            "/api/crm/documents/",
            {"title": "Signed Contract", "category": "LEGAL",
             "file": SimpleUploadedFile("signed_contract.pdf", b"%PDF-1.4 v1", content_type="application/pdf")},
            format="multipart",
        )
        self.assertEqual(resp.status_code, 201, resp.data)
        self.doc = Document.objects.get(pk=resp.data["id"])
        self.preview_url = resp.data["preview_url"]
        self.client.credentials()

    def tearDown(self):
        doc = Document.objects.filter(pk=self.doc.pk).first()
        if doc:
            _remove_files([ver.file for ver in doc.versions.all()] + [doc.file])

    def auth(self, user):
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {RefreshToken.for_user(user).access_token}")

    def _path_and_query(self, url):
        parts = urlsplit(url)
        return f"{parts.path}?{parts.query}" if parts.query else parts.path

    def test_serializer_urls_are_signed_and_load_without_header(self):
        self.assertIn("sig=", self.preview_url)
        resp = self.client.get(self.preview_url)
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(b"".join(resp.streaming_content), b"%PDF-1.4 v1")
        self.assertIn("inline", resp["Content-Disposition"])

    def test_unsigned_request_without_header_is_rejected(self):
        self.assertEqual(self.client.get(f"/api/crm/documents/{self.doc.pk}/preview/").status_code, 401)

    def test_signed_url_expires(self):
        with override_settings(PRIVATE_URL_MAX_AGE=60):
            url = sign_private_url(f"/api/crm/documents/{self.doc.pk}/preview/", self.ho_user)
            self.assertEqual(self.client.get(url).status_code, 200)
            with mock.patch("django.core.signing.time.time", return_value=time.time() + 61):
                resp = self.client.get(url)
            self.assertEqual(resp.status_code, 401)
            self.assertIn("expired", str(resp.data["detail"]))

    def test_default_lifetime_is_fifteen_minutes(self):
        url = sign_private_url(f"/api/crm/documents/{self.doc.pk}/preview/", self.ho_user)
        with mock.patch("django.core.signing.time.time", return_value=time.time() + 14 * 60):
            self.assertEqual(self.client.get(url).status_code, 200)
        with mock.patch("django.core.signing.time.time", return_value=time.time() + 16 * 60):
            self.assertEqual(self.client.get(url).status_code, 401)

    def test_signature_is_bound_to_path(self):
        sig = parse_qs(urlsplit(self.preview_url).query)["sig"][0]
        resp = self.client.get(f"/api/crm/documents/{self.doc.pk}/download/", {"sig": sig})
        self.assertEqual(resp.status_code, 401)
        resp = self.client.get("/api/crm/documents/", {"sig": sig})
        self.assertEqual(resp.status_code, 401)

    def test_signature_is_bound_to_user_and_permissions_still_apply(self):
        url = f"/api/crm/documents/{self.doc.pk}/preview/"
        self.assertEqual(self.client.get(sign_private_url(url, self.no_perm_user)).status_code, 403)
        # Dealer user cannot reach an HO document outside their dealership.
        self.assertIn(self.client.get(sign_private_url(url, self.dealer_user)).status_code, (403, 404))

        signed = sign_private_url(url, self.ho_user)
        self.ho_user.is_active = False
        self.ho_user.save(update_fields=["is_active"])
        self.assertEqual(self.client.get(signed).status_code, 401)

    def test_signature_only_authenticates_safe_methods(self):
        url = sign_private_url(f"/api/crm/documents/{self.doc.pk}/", self.ho_user)
        resp = self.client.patch(self._path_and_query(url), {"title": "Hijacked"}, format="json")
        self.assertEqual(resp.status_code, 401)
        self.doc.refresh_from_db()
        self.assertEqual(self.doc.title, "Signed Contract")

    def test_raw_access_token_in_query_is_not_accepted(self):
        token = str(RefreshToken.for_user(self.ho_user).access_token)
        resp = self.client.get(f"/api/crm/documents/{self.doc.pk}/preview/", {"token": token})
        self.assertEqual(resp.status_code, 401)

    def test_tampered_signature_rejected(self):
        resp = self.client.get(self.preview_url[:-3] + "xyz")
        self.assertEqual(resp.status_code, 401)

    def test_external_urls_pass_through_unsigned(self):
        self.assertEqual(sign_private_url("https://cdn.example.com/a.png", self.ho_user), "https://cdn.example.com/a.png")
        self.assertEqual(sign_private_url("/media/public.png", self.ho_user), "/media/public.png")

    def test_shipment_checklist_links_attached_document_with_signed_url(self):
        from crm.models import DocumentAttachment, DocumentTypeMaster
        from inventory.models import ImportBatch

        dtype, _ = DocumentTypeMaster.objects.get_or_create(
            code="BILL_OF_LADING", defaults={"name": "Bill of Lading", "is_required_for_shipment": True}
        )
        DocumentTypeMaster.objects.filter(pk=dtype.pk).update(is_required_for_shipment=True, is_active=True)
        self.doc.document_type_master = dtype
        self.doc.save(update_fields=["document_type_master"])
        batch = ImportBatch.objects.create()
        DocumentAttachment.objects.create(document=self.doc, shipment=batch, created_by=self.ho_user)

        admin = User.objects.create_superuser("sig-admin", "sig-admin@example.test", "pw")
        self.auth(admin)
        checklist = self.client.get(f"/api/inventory/batches/{batch.pk}/").data["required_documents_checklist"]
        bol = next(i for i in checklist["items"] if i["code"] == "BILL_OF_LADING")
        self.assertTrue(bol["is_attached"])
        self.assertEqual(bol["document_title"], "Signed Contract")
        self.assertEqual(checklist["attached_count"], checklist["total_required"] - checklist["missing_required_count"])

        self.client.credentials()
        self.assertEqual(self.client.get(bol["document_file_url"]).status_code, 200)

    def test_version_download_uses_signed_link_and_serves_that_version(self):
        self.auth(self.ho_user)
        self.client.post(
            f"/api/crm/documents/{self.doc.pk}/replace-file/",
            {"file": SimpleUploadedFile("signed_contract_v2.pdf", b"%PDF-1.4 v2", content_type="application/pdf"),
             "change_note": "v2"},
            format="multipart",
        )
        download_url = self.client.get(f"/api/crm/documents/{self.doc.pk}/").data["download_url"]
        self.client.credentials()

        latest = self.client.get(download_url)
        self.assertEqual(b"".join(latest.streaming_content), b"%PDF-1.4 v2")
        v1 = self.client.get(download_url + "&version=1")
        self.assertEqual(v1.status_code, 200)
        self.assertEqual(b"".join(v1.streaming_content), b"%PDF-1.4 v1")
        self.assertEqual(self.client.get(download_url + "&version=9").status_code, 400)


class SignedEmployeePhotoTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user("photo-user", "photo@example.test", "pw")
        self.profile = UserProfile.objects.create(user=self.user)
        self.profile.photo.save("employee.png", SimpleUploadedFile("employee.png", PNG, content_type="image/png"))
        self.other = User.objects.create_user("photo-other", "other@example.test", "pw")

    def tearDown(self):
        _remove_files([self.profile.photo])

    def test_profile_photo_url_is_signed_and_loads_in_img(self):
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {RefreshToken.for_user(self.user).access_token}")
        photo_url = self.client.get("/api/auth/user/").data["photo_url"]
        self.assertIn(f"/api/users/{self.user.pk}/photo/", photo_url)
        self.assertIn("sig=", photo_url)

        self.client.credentials()
        resp = self.client.get(photo_url)
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(b"".join(resp.streaming_content), PNG)

        # Another (non-admin) user's signature cannot open this employee's photo.
        other_url = sign_private_url(f"/api/users/{self.user.pk}/photo/", self.other)
        self.assertEqual(self.client.get(other_url).status_code, 403)
