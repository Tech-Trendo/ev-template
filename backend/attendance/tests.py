from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import Role, get_user_profile, seed_starter_roles

User = get_user_model()


def make_admin(username="admin"):
    """Staff user holding the Super Admin role (post-migration equivalent)."""
    admin = User.objects.create_user(username=username, password="pw123456", is_staff=True)
    get_user_profile(admin).roles.set(Role.objects.filter(name="Super Admin"))
    return admin


def make_hr(username="hr"):
    user = User.objects.create_user(username=username, password="pw123456", is_staff=True)
    get_user_profile(user).roles.set(Role.objects.filter(name="HR/Admin"))
    return user


class FaceAttendanceRemovedTest(APITestCase):
    def test_face_routes_are_gone(self):
        self.assertEqual(self.client.post("/api/attendance/profiles/", {}, format="json").status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(self.client.post("/api/attendance/verify/", {}, format="json").status_code, status.HTTP_404_NOT_FOUND)


class AttendanceLogTest(APITestCase):
    @classmethod
    def setUpTestData(cls):
        seed_starter_roles()
        cls.admin = make_admin()
        cls.hr = make_hr()
        cls.staff = User.objects.create_user(username="staff", password="pw123456", is_staff=True)
        from attendance.models import AttendanceRecord

        AttendanceRecord.objects.create(user=cls.admin, type="check_in", device="kiosk-1")
        AttendanceRecord.objects.create(user=cls.staff, type="check_out", device="phone")

    def test_own_only_scoping(self):
        self.client.force_authenticate(self.staff)
        rows = self.client.get("/api/attendance/records/").json()
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["username"], "staff")

    def test_manager_sees_all_and_exports_csv(self):
        self.client.force_authenticate(self.admin)
        rows = self.client.get("/api/attendance/records/").json()
        self.assertEqual(len(rows), 2)
        resp = self.client.get("/api/attendance/records/export/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIn("text/csv", resp["Content-Type"])
        self.assertIn("attendance-export.csv", resp["Content-Disposition"])
        body = resp.content.decode()
        self.assertIn("username", body)
        self.assertIn("kiosk-1", body)

    def test_hr_can_export_and_record_for_someone_else(self):
        self.client.force_authenticate(self.hr)
        listed = self.client.get("/api/attendance/records/")
        self.assertEqual(listed.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(len(listed.json()), 2)
        export = self.client.get("/api/attendance/records/export/")
        self.assertEqual(export.status_code, status.HTTP_200_OK)
        created = self.client.post(
            "/api/attendance/records/",
            {
                "user": self.staff.id,
                "type": "check_in",
                "device": "HR manual entry",
                "location": "Head office",
            },
            format="json",
        )
        self.assertEqual(created.status_code, status.HTTP_201_CREATED, created.content)
        self.assertEqual(created.json()["username"], "staff")
        self.assertIsNone(created.json()["confidence_score"])

    def test_staff_cannot_export(self):
        self.client.force_authenticate(self.staff)
        resp = self.client.get("/api/attendance/records/export/")
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_staff_cannot_record_own_attendance(self):
        self.client.force_authenticate(self.staff)
        resp = self.client.post(
            "/api/attendance/records/",
            {"user": self.staff.id, "type": "check_in"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)
