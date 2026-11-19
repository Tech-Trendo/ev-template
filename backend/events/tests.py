from django.test import TestCase
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken
from vehicles.models import Vehicle
from events.models import Event, InterestLevel, EventVisitor

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

class InterestLevelTests(TestCase):
    def setUp(self):
        self.client, _ = get_admin_client()

    def test_default_levels_exist(self):
        # Seeded by migration
        self.assertTrue(InterestLevel.objects.filter(name="Hot").exists())
        self.assertTrue(InterestLevel.objects.filter(name="Warm").exists())
        self.assertTrue(InterestLevel.objects.filter(name="Cold").exists())
        self.assertTrue(InterestLevel.objects.filter(name="Normal Inquiry").exists())
        # Hot should be first by default ordering (creation order)
        first = InterestLevel.objects.first()
        self.assertEqual(first.name, "Hot")

    def test_create_custom_level(self):
        resp = self.client.post("/api/interest-levels/", {"name": "Fleet Opportunity"}, format="json")
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data["name"], "Fleet Opportunity")
        # removed fields should not be exposed
        self.assertNotIn("sort_order", resp.data)
        self.assertNotIn("visitors_count", resp.data)

    def test_duplicate_name_fails(self):
        resp = self.client.post("/api/interest-levels/", {"name": "Hot"}, format="json")
        self.assertEqual(resp.status_code, 400)

    def test_update_level(self):
        lvl = InterestLevel.objects.get(name="Warm")
        resp = self.client.patch(f"/api/interest-levels/{lvl.id}/", {"name": "Warm Updated"}, format="json")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["name"], "Warm Updated")

    def test_activate_deactivate(self):
        lvl = InterestLevel.objects.get(name="Cold")
        resp = self.client.patch(f"/api/interest-levels/{lvl.id}/", {"is_active": False}, format="json")
        self.assertEqual(resp.status_code, 200)
        self.assertFalse(resp.data["is_active"])
        resp2 = self.client.patch(f"/api/interest-levels/{lvl.id}/", {"is_active": True}, format="json")
        self.assertTrue(resp2.data["is_active"])

    def test_safe_deletion_protects_in_use(self):
        hot = InterestLevel.objects.get(name="Hot")
        event = Event.objects.create(name="Test Event", start_date="2026-09-10", end_date="2026-09-12")
        EventVisitor.objects.create(event=event, name="Visitor", visited_at="2026-09-10T10:00:00Z", interest_level=hot)
        resp = self.client.delete(f"/api/interest-levels/{hot.id}/")
        self.assertEqual(resp.status_code, 400)
        self.assertIn("already in use", resp.data["detail"])

    def test_delete_unused_level(self):
        resp = self.client.post("/api/interest-levels/", {"name": "TempLevel"}, format="json")
        nid = resp.data["id"]
        del_resp = self.client.delete(f"/api/interest-levels/{nid}/")
        self.assertEqual(del_resp.status_code, 204)

    def test_list_filter_active(self):
        # deactivate one
        cold = InterestLevel.objects.get(name="Cold")
        cold.is_active = False
        cold.save()
        resp = self.client.get("/api/interest-levels/?is_active=true")
        names = [r["name"] for r in resp.data]
        self.assertNotIn("Cold", names)
        resp2 = self.client.get("/api/interest-levels/?is_active=false")
        names2 = [r["name"] for r in resp2.data]
        self.assertIn("Cold", names2)


class EventTests(TestCase):
    def setUp(self):
        self.client, _ = get_admin_client()
        self.anon = APIClient()

    def test_create_event(self):
        resp = self.client.post("/api/events/", {"name": "VT EV Experience Kathmandu", "start_date": "2026-09-10", "end_date": "2026-09-12"}, format="json")
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data["name"], "VT EV Experience Kathmandu")
        self.assertIn("status", resp.data)

    def test_read_event(self):
        ev = Event.objects.create(name="EV", start_date="2026-09-10", end_date="2026-09-12")
        resp = self.client.get(f"/api/events/{ev.id}/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["name"], "EV")

    def test_update_event(self):
        ev = Event.objects.create(name="EV", start_date="2026-09-10", end_date="2026-09-12")
        resp = self.client.patch(f"/api/events/{ev.id}/", {"name": "Updated"}, format="json")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["name"], "Updated")

    def test_delete_event_cascades_visitors(self):
        ev = Event.objects.create(name="EV", start_date="2026-09-10", end_date="2026-09-12")
        hot = InterestLevel.objects.get(name="Hot")
        EventVisitor.objects.create(event=ev, name="V1", visited_at="2026-09-10T10:00:00Z", interest_level=hot)
        self.assertEqual(EventVisitor.objects.filter(event=ev).count(), 1)
        resp = self.client.delete(f"/api/events/{ev.id}/")
        self.assertEqual(resp.status_code, 204)
        self.assertFalse(Event.objects.filter(id=ev.id).exists())
        self.assertEqual(EventVisitor.objects.filter(event_id=ev.id).count(), 0)

    def test_invalid_dates(self):
        resp = self.client.post("/api/events/", {"name": "Bad", "start_date": "2026-09-12", "end_date": "2026-09-10"}, format="json")
        self.assertEqual(resp.status_code, 400)
        self.assertIn("end_date", resp.data)

    def test_name_required(self):
        resp = self.client.post("/api/events/", {"name": "", "start_date": "2026-09-10", "end_date": "2026-09-12"}, format="json")
        self.assertEqual(resp.status_code, 400)

    def test_status_derived(self):
        # Create upcoming event (future)
        ev_up = Event.objects.create(name="Upcoming", start_date="2099-01-01", end_date="2099-01-10")
        resp = self.client.get(f"/api/events/{ev_up.id}/")
        self.assertEqual(resp.data["status"], "upcoming")
        # Ongoing: today between start and end
        from django.utils import timezone
        today = timezone.localdate()
        ev_on = Event.objects.create(name="Ongoing", start_date=today, end_date=today)
        resp2 = self.client.get(f"/api/events/{ev_on.id}/")
        self.assertEqual(resp2.data["status"], "ongoing")
        # Completed: past
        ev_comp = Event.objects.create(name="Completed", start_date="2020-01-01", end_date="2020-01-02")
        resp3 = self.client.get(f"/api/events/{ev_comp.id}/")
        self.assertEqual(resp3.data["status"], "completed")

    def test_visitor_count(self):
        ev = Event.objects.create(name="EV", start_date="2026-09-10", end_date="2026-09-12")
        hot = InterestLevel.objects.get(name="Hot")
        EventVisitor.objects.create(event=ev, name="V1", visited_at="2026-09-10T10:00:00Z", interest_level=hot)
        EventVisitor.objects.create(event=ev, name="V2", visited_at="2026-09-10T10:00:00Z", interest_level=hot)
        resp = self.client.get("/api/events/")
        # find our event
        found = [e for e in resp.data if e["id"] == ev.id][0]
        self.assertEqual(found["visitors_count"], 2)

    def test_permissions(self):
        # anonymous can list and retrieve
        ev = Event.objects.create(name="EV", start_date="2026-09-10", end_date="2026-09-12")
        resp_list = self.anon.get("/api/events/")
        self.assertEqual(resp_list.status_code, 200)
        resp_ret = self.anon.get(f"/api/events/{ev.id}/")
        self.assertEqual(resp_ret.status_code, 200)
        # but cannot create
        resp_create = self.anon.post("/api/events/", {"name": "X", "start_date": "2026-09-10", "end_date": "2026-09-12"}, format="json")
        self.assertIn(resp_create.status_code, [401, 403])
        # regular non-staff cannot create
        reg_client, _ = get_regular_client()
        resp_reg = reg_client.post("/api/events/", {"name": "X", "start_date": "2026-09-10", "end_date": "2026-09-12"}, format="json")
        self.assertIn(resp_reg.status_code, [401, 403])


class VisitorTests(TestCase):
    def setUp(self):
        self.client, _ = get_admin_client()
        self.event = Event.objects.create(name="VT EV Experience Kathmandu", start_date="2026-09-10", end_date="2026-09-12")
        self.hot = InterestLevel.objects.get(name="Hot")
        self.warm = InterestLevel.objects.get(name="Warm")
        # Create vehicles
        self.v1 = Vehicle.objects.create(name="AOCHI 6T", category="Truck", slug="aochi-6t-test1")
        self.v2 = Vehicle.objects.create(name="AOCHI 10T", category="Truck", slug="aochi-10t-test1")
        # Ensure slug uniqueness
        self.v1.save()

    def test_create_visitor(self):
        resp = self.client.post(f"/api/events/{self.event.id}/visitors/", {"name": "Ram Sharma", "phone": "9801234567", "email": "ram@test.com", "address": "Kathmandu", "interest_level": self.hot.id, "vehicle": self.v1.id, "visited_at": "2026-09-10T10:00:00Z"}, format="json")
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data["name"], "Ram Sharma")

    def test_create_visitor_defaults_to_hot(self):
        resp = self.client.post(f"/api/events/{self.event.id}/visitors/", {"name": "Default Hot", "visited_at": "2026-09-10T10:00:00Z"}, format="json")
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data["interest_level"], self.hot.id)

    def test_read_visitor(self):
        v = EventVisitor.objects.create(event=self.event, name="Suman", visited_at="2026-09-10T10:00:00Z", interest_level=self.hot)
        resp = self.client.get(f"/api/events/{self.event.id}/visitors/{v.id}/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["name"], "Suman")

    def test_update_visitor(self):
        v = EventVisitor.objects.create(event=self.event, name="Nisha", visited_at="2026-09-10T10:00:00Z", interest_level=self.hot)
        resp = self.client.patch(f"/api/events/{self.event.id}/visitors/{v.id}/", {"name": "Nisha Updated", "phone": "981234"}, format="json")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["name"], "Nisha Updated")

    def test_delete_visitor(self):
        v = EventVisitor.objects.create(event=self.event, name="Del", visited_at="2026-09-10T10:00:00Z", interest_level=self.hot)
        resp = self.client.delete(f"/api/events/{self.event.id}/visitors/{v.id}/")
        self.assertEqual(resp.status_code, 204)
        self.assertFalse(EventVisitor.objects.filter(id=v.id).exists())

    def test_event_relationship(self):
        v = EventVisitor.objects.create(event=self.event, name="Rel", visited_at="2026-09-10T10:00:00Z", interest_level=self.hot)
        self.assertEqual(v.event.id, self.event.id)
        # visitors_count via API
        resp = self.client.get("/api/events/")
        found = [e for e in resp.data if e["id"] == self.event.id][0]
        self.assertEqual(found["visitors_count"], 1)

    def test_vehicle_relationship(self):
        resp = self.client.post(f"/api/events/{self.event.id}/visitors/", {"name": "Veh Test", "interest_level": self.hot.id, "vehicle": self.v2.id, "visited_at": "2026-09-10T10:00:00Z"}, format="json")
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data["vehicle"], self.v2.id)
        self.assertEqual(resp.data["vehicle_detail"]["name"], self.v2.name)

    def test_interest_level_relationship(self):
        resp = self.client.post(f"/api/events/{self.event.id}/visitors/", {"name": "Interest Test", "interest_level": self.warm.id, "visited_at": "2026-09-10T10:00:00Z"}, format="json")
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data["interest_level"], self.warm.id)
        self.assertEqual(resp.data["interest_level_detail"]["name"], "Warm")

    def test_photo_upload(self):
        # Create a tiny PNG via Pillow? Use simple uploaded file
        gif_bytes = b'\x47\x49\x46\x38\x39\x61\x01\x00\x01\x00\x80\x00\x00\xff\xff\xff\x00\x00\x00\x21\xf9\x04\x01\x00\x00\x00\x00\x2c\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02\x44\x01\x00\x3b'
        photo = SimpleUploadedFile("test.gif", gif_bytes, content_type="image/gif")
        resp = self.client.post(f"/api/events/{self.event.id}/visitors/", {"name": "Photo Visitor", "interest_level": self.hot.id, "visited_at": "2026-09-10T10:00:00Z", "photo": photo}, format="multipart")
        self.assertEqual(resp.status_code, 201)
        self.assertTrue(resp.data["photo_display"] != "")

    def test_filter_by_date(self):
        EventVisitor.objects.create(event=self.event, name="A", visited_at="2026-09-10T10:00:00Z", interest_level=self.hot)
        EventVisitor.objects.create(event=self.event, name="B", visited_at="2026-09-11T10:00:00Z", interest_level=self.hot)
        resp = self.client.get(f"/api/events/{self.event.id}/visitors/?date=2026-09-10")
        self.assertEqual(resp.status_code, 200)
        names = [r["name"] for r in resp.data]
        self.assertIn("A", names)
        self.assertNotIn("B", names)

    def test_filter_by_date_range(self):
        EventVisitor.objects.create(event=self.event, name="A", visited_at="2026-09-10T10:00:00Z", interest_level=self.hot)
        EventVisitor.objects.create(event=self.event, name="B", visited_at="2026-09-11T10:00:00Z", interest_level=self.hot)
        EventVisitor.objects.create(event=self.event, name="C", visited_at="2026-09-12T10:00:00Z", interest_level=self.hot)
        resp = self.client.get(f"/api/events/{self.event.id}/visitors/?date_from=2026-09-10&date_to=2026-09-11")
        names = [r["name"] for r in resp.data]
        self.assertIn("A", names)
        self.assertIn("B", names)
        self.assertNotIn("C", names)

    def test_filter_by_interest_level(self):
        EventVisitor.objects.create(event=self.event, name="Hot Guy", visited_at="2026-09-10T10:00:00Z", interest_level=self.hot)
        EventVisitor.objects.create(event=self.event, name="Warm Guy", visited_at="2026-09-10T10:00:00Z", interest_level=self.warm)
        resp = self.client.get(f"/api/events/{self.event.id}/visitors/?interest_level={self.hot.id}")
        names = [r["name"] for r in resp.data]
        self.assertIn("Hot Guy", names)
        self.assertNotIn("Warm Guy", names)
        # also by name
        resp2 = self.client.get(f"/api/events/{self.event.id}/visitors/?interest_level=Hot")
        names2 = [r["name"] for r in resp2.data]
        self.assertIn("Hot Guy", names2)

    def test_filter_by_vehicle(self):
        EventVisitor.objects.create(event=self.event, name="V6", visited_at="2026-09-10T10:00:00Z", interest_level=self.hot, vehicle=self.v1)
        EventVisitor.objects.create(event=self.event, name="V10", visited_at="2026-09-10T10:00:00Z", interest_level=self.hot, vehicle=self.v2)
        resp = self.client.get(f"/api/events/{self.event.id}/visitors/?vehicle={self.v1.id}")
        names = [r["name"] for r in resp.data]
        self.assertIn("V6", names)
        self.assertNotIn("V10", names)

    def test_search(self):
        EventVisitor.objects.create(event=self.event, name="Ram Sharma", phone="980000", email="ram@test.com", visited_at="2026-09-10T10:00:00Z", interest_level=self.hot)
        EventVisitor.objects.create(event=self.event, name="Suman", phone="981111", email="suman@test.com", visited_at="2026-09-10T10:00:00Z", interest_level=self.hot)
        resp = self.client.get(f"/api/events/{self.event.id}/visitors/?search=Ram")
        names = [r["name"] for r in resp.data]
        self.assertIn("Ram Sharma", names)
        self.assertNotIn("Suman", names)
        resp2 = self.client.get(f"/api/events/{self.event.id}/visitors/?search=980000")
        self.assertEqual(resp2.data[0]["name"], "Ram Sharma")
        resp3 = self.client.get(f"/api/events/{self.event.id}/visitors/?search=ram@test.com")
        self.assertEqual(resp3.data[0]["name"], "Ram Sharma")

    def test_combined_filters(self):
        EventVisitor.objects.create(event=self.event, name="Target", phone="980", visited_at="2026-09-10T12:00:00Z", interest_level=self.hot, vehicle=self.v2)
        EventVisitor.objects.create(event=self.event, name="Other Date", phone="980", visited_at="2026-09-11T12:00:00Z", interest_level=self.hot, vehicle=self.v2)
        EventVisitor.objects.create(event=self.event, name="Other Interest", phone="980", visited_at="2026-09-10T12:00:00Z", interest_level=self.warm, vehicle=self.v2)
        EventVisitor.objects.create(event=self.event, name="Other Vehicle", phone="980", visited_at="2026-09-10T12:00:00Z", interest_level=self.hot, vehicle=self.v1)
        resp = self.client.get(f"/api/events/{self.event.id}/visitors/?date=2026-09-10&interest_level={self.hot.id}&vehicle={self.v2.id}&search=Target")
        names = [r["name"] for r in resp.data]
        self.assertEqual(names, ["Target"])

    def test_pagination(self):
        for i in range(15):
            EventVisitor.objects.create(event=self.event, name=f"Visitor {i}", visited_at="2026-09-10T10:00:00Z", interest_level=self.hot)
        resp = self.client.get(f"/api/events/{self.event.id}/visitors/?page=1&page_size=10")
        self.assertEqual(resp.status_code, 200)
        self.assertIn("results", resp.data)
        self.assertEqual(len(resp.data["results"]), 10)
        self.assertEqual(resp.data["count"], 15)
        self.assertEqual(resp.data["total_pages"], 2)
        resp2 = self.client.get(f"/api/events/{self.event.id}/visitors/?page=2&page_size=10")
        self.assertEqual(len(resp2.data["results"]), 5)

    def test_permissions_visitors_require_admin(self):
        anon = APIClient()
        EventVisitor.objects.create(event=self.event, name="Perm", visited_at="2026-09-10T10:00:00Z", interest_level=self.hot)
        # anon cannot list
        resp = anon.get(f"/api/events/{self.event.id}/visitors/")
        self.assertIn(resp.status_code, [401, 403])
        # regular non-staff cannot
        reg, _ = get_regular_client()
        resp2 = reg.get(f"/api/events/{self.event.id}/visitors/")
        self.assertIn(resp2.status_code, [401, 403])
        # can read event though
        resp3 = anon.get("/api/events/")
        self.assertEqual(resp3.status_code, 200)
