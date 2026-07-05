from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError

from expenses.services.categories import seed_default_categories


class Command(BaseCommand):
    help = "Create the default expense categories for a user."

    def add_arguments(self, parser):
        parser.add_argument("--email", help="Seed defaults for this user email.")
        parser.add_argument(
            "--all",
            action="store_true",
            help="Seed defaults for every user.",
        )

    def handle(self, *args, **options):
        email = options.get("email")
        seed_all = options.get("all")
        User = get_user_model()

        if not email and not seed_all:
            raise CommandError("Pass --email=user@example.com or --all.")

        if email:
            users = User.objects.filter(email=email.strip().lower())
            if not users.exists():
                raise CommandError("No user found for that email.")
        else:
            users = User.objects.all()

        total = 0
        for user in users:
            categories = seed_default_categories(user)
            total += len(categories)
            self.stdout.write(
                self.style.SUCCESS(
                    f"Seeded {len(categories)} default categories for {user.email or user.username}."
                )
            )

        self.stdout.write(self.style.SUCCESS(f"Done. Processed {users.count()} user(s)."))
