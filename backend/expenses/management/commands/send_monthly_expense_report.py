from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.core.validators import validate_email
from django.core.exceptions import ValidationError

from expenses.services.email_reports import send_monthly_report_email
from expenses.services.reports import parse_month_range


class Command(BaseCommand):
    help = "Email a monthly house expense PDF report."

    def add_arguments(self, parser):
        parser.add_argument(
            "--month",
            required=True,
            help="Report month in YYYY-MM format, for example 2026-07.",
        )
        parser.add_argument(
            "--email",
            required=True,
            help="Recipient email address.",
        )

    def handle(self, *args, **options):
        month = options["month"]
        recipient = options["email"]

        try:
            validate_email(recipient)
        except ValidationError:
            raise CommandError("Invalid recipient email address.")

        if not settings.EMAIL_HOST:
            raise CommandError("EMAIL_HOST is not configured.")

        if not settings.DEFAULT_FROM_EMAIL:
            raise CommandError("DEFAULT_FROM_EMAIL is not configured.")

        try:
            start, end = parse_month_range(month)
        except ValueError as exc:
            raise CommandError(str(exc))

        try:
            sent_count, filename = send_monthly_report_email(start, end, recipient)
        except Exception as exc:
            raise CommandError(
                "Failed to send monthly expense report. "
                f"Check SMTP settings and provider access. Error: {exc.__class__.__name__}"
            )

        if sent_count:
            self.stdout.write(
                self.style.SUCCESS(
                    f"Sent {filename} to {recipient} using configured email backend."
                )
            )
        else:
            raise CommandError("Email backend did not report a sent message.")
