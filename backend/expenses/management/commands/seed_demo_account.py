from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.utils import timezone
from rest_framework.authtoken.models import Token

from expenses.models import (
    BillOccurrence,
    CategoryBudget,
    Expense,
    ExpenseCategory,
    ExpenseShare,
    Household,
    HouseholdMember,
    MonthlyBudget,
    PeopleInvitation,
    Person,
    RecurringBill,
    Settlement,
)


User = get_user_model()

DEMO_EMAIL = "kamalesh.demo@test.com"
DEMO_PASSWORD = "SoraDemo@2026"


class Command(BaseCommand):
    help = "Create one realistic demo account with sample Sora Expense data."

    def add_arguments(self, parser):
        parser.add_argument(
            "--keep-existing",
            action="store_true",
            help="Do not delete the existing demo account before seeding.",
        )

    def handle(self, *args, **options):
        if not options["keep_existing"]:
            User.objects.filter(username=DEMO_EMAIL).delete()

        user, created = User.objects.get_or_create(
            username=DEMO_EMAIL,
            defaults={
                "email": DEMO_EMAIL,
                "first_name": "Kamalesh",
                "last_name": "Raman",
            },
        )
        user.email = DEMO_EMAIL
        user.first_name = "Kamalesh"
        user.last_name = "Raman"
        user.set_password(DEMO_PASSWORD)
        user.save()
        token, _ = Token.objects.get_or_create(user=user)

        month = date(2026, 7, 1)
        previous_month = date(2026, 6, 1)

        categories = self.create_categories(user)
        people = self.create_people(user)
        household = self.create_household(user, people)
        self.create_budgets(user, household, categories, month, previous_month)
        self.create_expenses(user, household, categories, people)
        self.create_income_and_shared_expenses(user, household, categories, people)
        self.create_recurring_bills(user, household, categories)
        self.create_invitations(user, people)

        status = "created" if created else "refreshed"
        self.stdout.write(self.style.SUCCESS(f"Demo account {status} successfully."))
        self.stdout.write(f"Email: {DEMO_EMAIL}")
        self.stdout.write(f"Password: {DEMO_PASSWORD}")
        self.stdout.write(f"Auth token: {token.key}")

    def create_categories(self, user):
        rows = [
            ("Groceries", "cart-outline", "#22C55E", ExpenseCategory.TransactionType.EXPENSE),
            ("Food & Dining", "silverware-fork-knife", "#F97316"),
            ("Utilities", "lightning-bolt-outline", "#3B82F6"),
            ("Transport", "gas-station-outline", "#EF4444"),
            ("Domestic Help", "broom", "#8B5CF6"),
            ("Rent", "home-city-outline", "#0EA5E9"),
            ("Health", "medical-bag", "#EC4899"),
            ("Shopping", "shopping-outline", "#F59E0B"),
            ("Entertainment", "movie-open-outline", "#6366F1"),
            ("Education", "book-open-page-variant-outline", "#14B8A6", ExpenseCategory.TransactionType.EXPENSE),
            ("Salary", "briefcase-outline", "#2E7D5B", ExpenseCategory.TransactionType.INCOME),
            ("Freelance", "laptop", "#6558D3", ExpenseCategory.TransactionType.INCOME),
        ]
        categories = {}
        for row in rows:
            name, icon, color = row[:3]
            transaction_type = row[3] if len(row) > 3 else ExpenseCategory.TransactionType.EXPENSE
            category, _ = ExpenseCategory.objects.update_or_create(
                user=user,
                name=name,
                transaction_type=transaction_type,
                defaults={"icon": icon, "color": color},
            )
            categories[name] = category
        return categories

    def create_people(self, user):
        rows = [
            ("Priya Raman", "priya.raman@test.com", "family", "Sister"),
            ("Arjun Menon", "arjun.menon@test.com", "roommate", "Roommate"),
            ("Meera Iyer", "meera.iyer@test.com", "friend", "Office friend"),
            ("Suresh Kumar", "suresh.kumar@test.com", "helper", "Domestic help"),
            ("Rahul Nair", "rahul.nair@test.com", "friend", "Gym friend"),
        ]
        people = {}
        for name, email, relation_type, note in rows:
            person, _ = Person.objects.update_or_create(
                owner=user,
                email=email,
                defaults={
                    "name": name,
                    "phone": "",
                    "relation_type": relation_type,
                    "notes": note,
                },
            )
            people[name] = person
        return people

    def create_household(self, user, people):
        household, _ = Household.objects.update_or_create(
            owner=user,
            name="Indiranagar Apartment",
            defaults={
                "description": "Demo shared apartment for client walkthroughs.",
                "monthly_budget": Decimal("65000.00"),
                "currency": "INR",
            },
        )
        HouseholdMember.objects.update_or_create(
            household=household,
            user=user,
            defaults={
                "role": HouseholdMember.Role.OWNER,
                "status": HouseholdMember.Status.ACTIVE,
                "visibility_level": HouseholdMember.VisibilityLevel.FULL_HOUSEHOLD,
            },
        )
        for person in [people["Priya Raman"], people["Arjun Menon"]]:
            HouseholdMember.objects.update_or_create(
                household=household,
                person=person,
                defaults={
                    "role": HouseholdMember.Role.MEMBER,
                    "status": HouseholdMember.Status.ACTIVE,
                    "visibility_level": HouseholdMember.VisibilityLevel.MONTHLY_SUMMARY,
                },
            )
        return household

    def create_budgets(self, user, household, categories, month, previous_month):
        MonthlyBudget.objects.update_or_create(
            user=user,
            month=month,
            defaults={"amount": Decimal("60000.00"), "note": "Monthly personal budget for July demo."},
        )
        MonthlyBudget.objects.update_or_create(
            user=user,
            month=previous_month,
            defaults={"amount": Decimal("58000.00"), "note": "Previous month comparison budget."},
        )
        category_budgets = {
            "Groceries": "12000.00",
            "Food & Dining": "9000.00",
            "Utilities": "6500.00",
            "Transport": "7000.00",
            "Domestic Help": "4500.00",
            "Health": "4000.00",
            "Shopping": "6000.00",
        }
        for name, amount in category_budgets.items():
            CategoryBudget.objects.update_or_create(
                user=user,
                category=categories[name],
                month=month,
                defaults={"amount": Decimal(amount), "note": f"{name} budget for July."},
            )
        CategoryBudget.objects.update_or_create(
            household=household,
            category=categories["Rent"],
            month=month,
            defaults={"amount": Decimal("30000.00"), "note": "Apartment rent budget."},
        )

    def create_expenses(self, user, household, categories, people):
        expense_rows = [
            ("Reliance Fresh", "1250.00", "Groceries", "upi", date(2026, 7, 5), "Weekly vegetables, fruits and milk."),
            ("D Mart monthly stock", "3420.00", "Groceries", "upi", date(2026, 7, 4), "Rice, dal, cleaning supplies and snacks."),
            ("Electricity Bill", "2400.00", "Utilities", "upi", date(2026, 7, 4), "BESCOM July bill."),
            ("Zomato dinner", "650.00", "Food & Dining", "upi", date(2026, 7, 3), "Dinner after late office work."),
            ("Petrol refill", "1800.00", "Transport", "upi", date(2026, 7, 3), "Bike petrol full tank."),
            ("Metro card recharge", "500.00", "Transport", "upi", date(2026, 7, 2), "Namma Metro commute."),
            ("Domestic help salary", "3500.00", "Domestic Help", "cash", date(2026, 7, 2), "Monthly cleaning help payment."),
            ("Apollo Pharmacy", "780.00", "Health", "upi", date(2026, 7, 1), "Medicines and supplements."),
            ("Amazon essentials", "1299.00", "Shopping", "upi", date(2026, 7, 1), "Kitchen containers and bulbs."),
            ("Movie tickets", "920.00", "Entertainment", "upi", date(2026, 6, 28), "Weekend movie with friends."),
            ("Internet bill", "999.00", "Utilities", "upi", date(2026, 6, 27), "ACT broadband bill."),
            ("Office lunch", "310.00", "Food & Dining", "cash", date(2026, 6, 26), "Lunch near office."),
        ]
        expenses = {}
        for title, amount, category_name, method, expense_date, note in expense_rows:
            expense, _ = Expense.objects.update_or_create(
                user=user,
                title=title,
                expense_date=expense_date,
                transaction_type=Expense.TransactionType.EXPENSE,
                defaults={
                    "amount": Decimal(amount),
                    "category": categories[category_name],
                    "payment_method": method,
                    "created_by": user,
                    "paid_by_user": user,
                    "visibility": Expense.Visibility.PRIVATE,
                    "expense_type": Expense.ExpenseType.PERSONAL,
                    "note": note,
                },
            )
            expenses[title] = expense

    def create_income_and_shared_expenses(self, user, household, categories, people):
        rows = [
            ("Monthly salary", "85000.00", "Salary", "bank", date(2026, 7, 1), "July salary credit."),
            ("Freelance design work", "12500.00", "Freelance", "bank", date(2026, 7, 6), "Client project payment."),
        ]
        for title, amount, category_name, method, transaction_date, note in rows:
            Expense.objects.update_or_create(
                user=user,
                title=title,
                expense_date=transaction_date,
                transaction_type=Expense.TransactionType.INCOME,
                defaults={
                    "amount": Decimal(amount),
                    "category": categories[category_name],
                    "payment_method": method,
                    "created_by": user,
                    "paid_by_user": user,
                    "visibility": Expense.Visibility.PRIVATE,
                    "expense_type": Expense.ExpenseType.PERSONAL,
                    "note": note,
                },
            )

        rent, _ = Expense.objects.update_or_create(
            user=user,
            household=household,
            title="Apartment rent",
            expense_date=date(2026, 7, 1),
            transaction_type=Expense.TransactionType.EXPENSE,
            defaults={
                "amount": Decimal("30000.00"),
                "category": categories["Rent"],
                "payment_method": Expense.PaymentMethod.UPI,
                "created_by": user,
                "paid_by_user": user,
                "visibility": Expense.Visibility.HOUSEHOLD,
                "expense_type": Expense.ExpenseType.HOUSEHOLD,
                "note": "Shared rent for Indiranagar apartment.",
            },
        )
        self.create_share(rent, people["Arjun Menon"], "10000.00", "3000.00", "Arjun paid part of rent.")
        self.create_share(rent, people["Priya Raman"], "10000.00", "10000.00", "Priya settled her rent share.")

        dinner, _ = Expense.objects.update_or_create(
            user=user,
            title="Barbeque Nation dinner",
            expense_date=date(2026, 7, 5),
            transaction_type=Expense.TransactionType.EXPENSE,
            defaults={
                "amount": Decimal("4200.00"),
                "category": categories["Food & Dining"],
                "payment_method": Expense.PaymentMethod.UPI,
                "created_by": user,
                "paid_by_user": user,
                "visibility": Expense.Visibility.SHARED,
                "expense_type": Expense.ExpenseType.SHARED,
                "note": "Dinner split with friends.",
            },
        )
        share = self.create_share(dinner, people["Meera Iyer"], "1400.00", "0.00", "Meera owes dinner share.")
        self.create_share(dinner, people["Rahul Nair"], "1400.00", "1400.00", "Rahul paid immediately.")
        Settlement.objects.update_or_create(
            expense=dinner,
            expense_share=share,
            from_person=people["Rahul Nair"],
            to_user=user,
            amount=Decimal("1400.00"),
            defaults={
                "method": Expense.PaymentMethod.UPI,
                "status": Settlement.Status.COMPLETED,
                "created_by": user,
                "note": "Rahul settled through UPI.",
                "settled_at": timezone.now(),
            },
        )

    def create_share(self, expense, person, share_amount, paid_amount, note):
        share, _ = ExpenseShare.objects.update_or_create(
            expense=expense,
            person=person,
            defaults={
                "share_amount": Decimal(share_amount),
                "paid_amount": Decimal(paid_amount),
                "note": note,
            },
        )
        return share

    def create_recurring_bills(self, user, household, categories):
        rows = [
            ("ACT Broadband", "999.00", "Utilities", date(2026, 7, 8), True, None),
            ("Netflix", "649.00", "Entertainment", date(2026, 7, 12), False, None),
            ("Apartment rent", "30000.00", "Rent", date(2026, 8, 1), True, household),
            ("Maid salary", "3500.00", "Domestic Help", date(2026, 8, 2), False, None),
        ]
        for name, amount, category_name, next_due_date, auto_create, bill_household in rows:
            bill, _ = RecurringBill.objects.update_or_create(
                user=None if bill_household else user,
                household=bill_household,
                name=name,
                defaults={
                    "amount": Decimal(amount),
                    "category": categories[category_name],
                    "payment_method": Expense.PaymentMethod.UPI,
                    "frequency": RecurringBill.Frequency.MONTHLY,
                    "due_day": next_due_date.day,
                    "next_due_date": next_due_date,
                    "reminder_days_before": 3,
                    "auto_create_expense": auto_create,
                    "is_active": True,
                    "note": f"Recurring {name} bill.",
                },
            )
            for occurrence_date in [date(2026, 7, bill.due_day), next_due_date]:
                BillOccurrence.objects.update_or_create(
                    recurring_bill=bill,
                    due_date=occurrence_date,
                    defaults={
                        "amount": bill.amount,
                        "status": BillOccurrence.Status.UPCOMING,
                    },
                )

    def create_invitations(self, user, people):
        for person in [people["Meera Iyer"], people["Rahul Nair"]]:
            PeopleInvitation.objects.update_or_create(
                invited_by=user,
                email=person.email,
                status=PeopleInvitation.Status.PENDING,
                defaults={
                    "relation_type": person.relation_type,
                    "person": person,
                    "token_hash": f"demo-token-{person.id}",
                    "expires_at": timezone.now() + timezone.timedelta(days=14),
                },
            )
