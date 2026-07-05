from datetime import date, timedelta

from django.core.management import call_command
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Email the previous calendar month's house expense PDF report."

    def add_arguments(self, parser):
        parser.add_argument(
            "--email",
            required=True,
            help="Recipient email address.",
        )

    def handle(self, *args, **options):
        first_day_this_month = date.today().replace(day=1)
        previous_month = first_day_this_month - timedelta(days=1)
        month_value = previous_month.strftime("%Y-%m")

        call_command(
            "send_monthly_expense_report",
            month=month_value,
            email=options["email"],
        )
