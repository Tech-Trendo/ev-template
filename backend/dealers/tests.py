from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import Role, get_user_profile, seed_starter_roles

User = get_user_model()


class DealerApiTest(APITestCase):
    """Dealers are admin-only (not shown on the public site)."""

    @classmethod
    def setUpTestData(cls):
        cls.staff = User.objects.create_user(username="staff", password="pw123456", is_staff=True)
        seed_starter_roles()

    def setUp(self):
        self.client.force_authenticate(self.staff)

    def test_anon_denied(self):
        self.client.force_authenticate(None)
        resp = self.client.get("/api/dealers/")
        self.assertIn(resp.status_code, (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN))

    def test_crud(self):
        created = self.client.post(
            "/api/dealers/",
            {"name": "KTM Motors", "district": "Kathmandu", "phone": "01-1"},
            format="json",
        )
        self.assertEqual(created.status_code, status.HTTP_201_CREATED, created.content)
        dealer_id = created.json()["id"]

        listing = self.client.get("/api/dealers/?search=ktm").json()
        self.assertTrue(any(d["id"] == dealer_id for d in listing))

        patched = self.client.patch(
            f"/api/dealers/{dealer_id}/", {"status": "inactive"}, format="json"
        )
        self.assertEqual(patched.status_code, status.HTTP_200_OK)
        self.assertEqual(patched.json()["status"], "inactive")

        filtered = self.client.get("/api/dealers/?status=inactive").json()
        self.assertTrue(any(d["id"] == dealer_id for d in filtered))

    def test_duplicate_name_rejected_case_insensitive(self):
        self.client.post("/api/dealers/", {"name": "KTM Motors"}, format="json")
        resp = self.client.post("/api/dealers/", {"name": "ktm motors"}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST, resp.content)

    def test_roleless_staff_denied(self):
        plain = User.objects.create_user(username="plain", password="pw123456", is_staff=True)
        self.client.force_authenticate(plain)
        resp = self.client.get("/api/dealers/")
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)


class RoleApiTest(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = User.objects.create_user(username="admin", password="pw123456", is_staff=True)
        seed_starter_roles()

    def setUp(self):
        self.client.force_authenticate(self.admin)

    def test_starter_roles_seeded(self):
        names = {r["name"] for r in self.client.get("/api/roles/").json()}
        self.assertTrue({"Super Admin", "Service Manager", "Technician", "Dealer Staff"} <= names)

    def test_existing_staff_backfilled_super_admin(self):
        self.assertTrue(
            get_user_profile(self.admin).roles.filter(name="Super Admin").exists()
        )

    def test_super_admin_role_protected(self):
        role_id = Role.objects.get(name="Super Admin").id
        resp = self.client.delete(f"/api/roles/{role_id}/")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_assign_roles_via_user_patch(self):
        user = User.objects.create_user(username="tech", password="pw123456", is_staff=True)
        tech_id = Role.objects.get(name="Technician").id
        resp = self.client.patch(f"/api/users/{user.id}/", {"roles": [tech_id]}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.content)
        self.assertEqual(resp.json()["roles"], [tech_id])
        self.assertEqual(resp.json()["role_names"], ["Technician"])

    def test_non_super_admin_cannot_manage_roles(self):
        tech = User.objects.create_user(username="tech", password="pw123456", is_staff=True)
        profile = get_user_profile(tech)
        profile.roles.set(Role.objects.filter(name="Technician"))
        self.client.force_authenticate(tech)
        resp = self.client.get("/api/roles/")
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)
