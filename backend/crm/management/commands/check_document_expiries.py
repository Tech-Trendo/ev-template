import datetime
from django.core.management.base import BaseCommand
from django.utils import timezone
from django.contrib.auth import get_user_model
from common.models import Notification
from crm.models import Document

User = get_user_model()


class Command(BaseCommand):
    help = "Scan documents and create in-app notifications for expired or soon-to-expire documents (within 30 days)."

    def handle(self, *args, **options):
        today = timezone.localdate()
        cutoff = today + datetime.timedelta(days=30)

        docs = Document.objects.filter(
            is_deleted=False,
            expiry_date__isnull=False,
            expiry_date__lte=cutoff,
        )

        staff_recipients = list(User.objects.filter(is_staff=True, is_active=True))
        created_count = 0

        for doc in docs:
            is_expired = doc.expiry_date < today
            ntype = (
                Notification.NotificationType.DOCUMENT_EXPIRED
                if is_expired
                else Notification.NotificationType.DOCUMENT_EXPIRING
            )
            status_text = "expired" if is_expired else f"expires on {doc.expiry_date}"
            title = f"Document {'Expired' if is_expired else 'Expiring'}: {doc.title}"
            message = f"Document '{doc.title}' ({doc.category}) {status_text}."

            recipients = set()
            if doc.uploaded_by and doc.uploaded_by.is_active:
                recipients.add(doc.uploaded_by)
            for s in staff_recipients[:5]:
                recipients.add(s)

            for user in recipients:
                dedup_key = f"doc_expiry_{doc.id}_{user.id}_{today.isoformat()}"
                if not Notification.objects.filter(recipient=user, dedup_key=dedup_key).exists():
                    Notification.objects.create(
                        recipient=user,
                        notification_type=ntype,
                        title=title,
                        message=message,
                        link="/dashboard/library",
                        dedup_key=dedup_key,
                    )
                    created_count += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"Document expiry check complete. Created {created_count} notification(s)."
            )
        )
