from datetime import date, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import SimpleTestCase, override_settings
from django.utils import timezone
from rest_framework.test import APITestCase

from expenses.models import (
    BillOccurrence,
    Expense,
    ExpenseCategory,
    ExpenseShare,
    Household,
    HouseholdMember,
    PeopleInvitation,
    Person,
    RecurringBill,
)
from expenses.services.people import accept_invitation, create_invitation
from expenses.services.splits import calculate_splits


User = get_user_model()


class SplitServiceTests(SimpleTestCase):
    def test_equal_split_handles_rounding(self):
        rows = calculate_splits(
            Decimal("100.00"),
            [{"person": 1}, {"person": 2}, {"person": 3}],
            "equal",
        )

        self.assertEqual(sum(row["share_amount"] for row in rows), Decimal("100.00"))
        self.assertEqual(rows[0]["share_amount"], Decimal("33.34"))

    def test_custom_split_total_must_match(self):
        with self.assertRaises(Exception):
            calculate_splits(
                Decimal("100.00"),
                [{"person": 1, "share_amount": "20.00"}, {"person": 2, "share_amount": "20.00"}],
                "custom_amount",
            )

    def test_percentage_split_requires_100_percent(self):
        with self.assertRaises(Exception):
            calculate_splits(
                Decimal("100.00"),
                [{"person": 1, "percentage": "60.00"}, {"person": 2, "percentage": "20.00"}],
                "percentage",
            )


@override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
class PeopleApiTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="me", email="me@example.com", password="pass12345")
        self.other = User.objects.create_user(username="other", email="other@example.com", password="pass12345")
        self.client.force_authenticate(self.user)

    def test_create_person_and_list_only_own_people(self):
        Person.objects.create(owner=self.other, name="Other Person", email="hidden@example.com")

        response = self.client.post(
            "/api/people/",
            {"name": "Rahul", "email": "rahul@example.com", "relation_type": "family"},
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        list_response = self.client.get("/api/people/")
        self.assertEqual(len(list_response.data), 1)
        self.assertEqual(list_response.data[0]["email"], "rahul@example.com")

    def test_invite_self_fails_and_duplicate_pending_invite_fails(self):
        self.assertEqual(
            self.client.post("/api/people/invite/", {"email": "me@example.com"}, format="json").status_code,
            400,
        )

        first = self.client.post("/api/people/invite/", {"email": "brother@example.com"}, format="json")
        second = self.client.post("/api/people/invite/", {"email": "brother@example.com"}, format="json")

        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 400)
        self.assertNotIn("token_hash", first.data)

    def test_accept_invite_links_person_to_user(self):
        person = Person.objects.create(owner=self.user, name="Other", email="other@example.com")
        invitation, token = create_invitation(self.user, "other@example.com", Person.RelationType.FAMILY, person)

        accepted = accept_invitation(token, self.other)
        person.refresh_from_db()

        self.assertEqual(accepted.status, PeopleInvitation.Status.ACCEPTED)
        self.assertEqual(person.linked_user, self.other)

    def test_cancelled_invite_cannot_be_accepted(self):
        invitation, token = create_invitation(self.user, "other@example.com", Person.RelationType.FAMILY)
        invitation.status = PeopleInvitation.Status.CANCELLED
        invitation.save(update_fields=["status"])

        with self.assertRaises(Exception):
            accept_invitation(token, self.other)


class HouseholdExpenseApiTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="owner", email="owner@example.com", password="pass12345")
        self.member_user = User.objects.create_user(username="member", email="member@example.com", password="pass12345")
        self.viewer_user = User.objects.create_user(username="viewer", email="viewer@example.com", password="pass12345")
        self.other = User.objects.create_user(username="stranger", email="stranger@example.com", password="pass12345")
        self.category = ExpenseCategory.objects.create(user=self.user, name="Groceries", icon="cart", color="#16a34a")
        self.client.force_authenticate(self.user)

    def test_create_household_creates_owner_member(self):
        response = self.client.post(
            "/api/households/",
            {"name": "Home", "monthly_budget": "45000.00", "currency": "INR"},
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertTrue(
            HouseholdMember.objects.filter(
                household_id=response.data["id"],
                user=self.user,
                role=HouseholdMember.Role.OWNER,
            ).exists()
        )

    def test_member_cannot_manage_members_and_viewer_cannot_create_expense(self):
        household = Household.objects.create(owner=self.user, name="Home")
        HouseholdMember.objects.create(
            household=household,
            user=self.user,
            role=HouseholdMember.Role.OWNER,
            visibility_level=HouseholdMember.VisibilityLevel.FULL_HOUSEHOLD,
        )
        HouseholdMember.objects.create(household=household, user=self.member_user, role=HouseholdMember.Role.MEMBER)
        HouseholdMember.objects.create(household=household, user=self.viewer_user, role=HouseholdMember.Role.VIEWER)

        self.client.force_authenticate(self.member_user)
        self.assertEqual(
            self.client.post(
                f"/api/households/{household.id}/members/",
                {"user": self.other.id, "role": "member"},
                format="json",
            ).status_code,
            400,
        )

        self.client.force_authenticate(self.viewer_user)
        response = self.client.post(
            "/api/expenses/",
            {
                "title": "Milk",
                "amount": "100.00",
                "category": self.category.id,
                "payment_method": "upi",
                "expense_date": "2026-07-05",
                "household": household.id,
                "expense_type": "household",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_existing_personal_expense_create_still_works_and_is_private(self):
        response = self.client.post(
            "/api/expenses/",
            {
                "title": "Tea",
                "amount": "25.00",
                "category": self.category.id,
                "payment_method": "cash",
                "expense_date": "2026-07-05",
                "note": "Morning",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["visibility"], Expense.Visibility.PRIVATE)
        self.assertEqual(response.data["expense_type"], Expense.ExpenseType.PERSONAL)

    def test_private_expense_is_not_visible_to_other_user(self):
        expense = Expense.objects.create(
            user=self.user,
            created_by=self.user,
            paid_by_user=self.user,
            title="Private",
            amount="10.00",
            category=self.category,
            payment_method="upi",
            expense_date="2026-07-05",
        )

        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.get(f"/api/expenses/{expense.id}/").status_code, 404)

    def test_shared_expense_equal_split_and_settlement(self):
        p1 = Person.objects.create(owner=self.user, name="A")
        p2 = Person.objects.create(owner=self.user, name="B")

        expense_response = self.client.post(
            "/api/expenses/",
            {
                "title": "Dinner",
                "amount": "100.00",
                "category": self.category.id,
                "payment_method": "upi",
                "expense_date": "2026-07-05",
                "expense_type": "shared",
                "visibility": "shared",
                "split_type": "equal",
                "participants": [{"person": p1.id}, {"person": p2.id}],
            },
            format="json",
        )

        self.assertEqual(expense_response.status_code, 201)
        self.assertEqual(ExpenseShare.objects.count(), 2)
        share = ExpenseShare.objects.filter(person=p1).first()
        self.assertEqual(share.share_amount, Decimal("50.00"))

        settlement_response = self.client.post(
            "/api/settlements/",
            {"expense_share": share.id, "amount": "25.00", "method": "upi", "status": "completed"},
            format="json",
        )
        share.refresh_from_db()

        self.assertEqual(settlement_response.status_code, 201)
        self.assertEqual(share.paid_amount, Decimal("25.00"))
        self.assertEqual(share.status, ExpenseShare.Status.PARTIALLY_PAID)

        overpay = self.client.post(
            "/api/settlements/",
            {"expense_share": share.id, "amount": "100.00", "method": "upi", "status": "completed"},
            format="json",
        )
        self.assertEqual(overpay.status_code, 400)


class BudgetRecurringReportTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="budget", email="budget@example.com", password="pass12345")
        self.category = ExpenseCategory.objects.create(user=self.user, name="Utilities", icon="bolt", color="#2563eb")
        self.client.force_authenticate(self.user)

    def test_category_budget_usage(self):
        self.client.post(
            "/api/category-budgets/",
            {"category": self.category.id, "month": "2026-07-17", "amount": "1000.00"},
            format="json",
        )
        Expense.objects.create(
            user=self.user,
            created_by=self.user,
            paid_by_user=self.user,
            title="Power",
            amount="800.00",
            category=self.category,
            payment_method="upi",
            expense_date="2026-07-05",
        )

        response = self.client.get("/api/category-budgets/usage/?month=2026-07")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["rows"][0]["used_percent"], "80.00")
        self.assertEqual(response.data["rows"][0]["status"], "careful")

    def test_recurring_bill_generates_occurrences_and_mark_paid_creates_expense(self):
        response = self.client.post(
            "/api/recurring-bills/",
            {
                "name": "Electricity Bill",
                "category": self.category.id,
                "amount": "2400.00",
                "payment_method": "upi",
                "frequency": "monthly",
                "due_day": 8,
                "next_due_date": "2026-07-08",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        bill = RecurringBill.objects.get(id=response.data["id"])
        self.assertEqual(bill.occurrences.count(), 3)

        occurrence = bill.occurrences.order_by("due_date").first()
        paid = self.client.post(f"/api/bill-occurrences/{occurrence.id}/mark-paid/", {"create_expense": True})
        occurrence.refresh_from_db()

        self.assertEqual(paid.status_code, 200)
        self.assertEqual(occurrence.status, BillOccurrence.Status.PAID)
        self.assertIsNotNone(occurrence.paid_expense)

    def test_household_report_excludes_private_personal_expenses(self):
        household = Household.objects.create(owner=self.user, name="Home", monthly_budget="5000.00")
        HouseholdMember.objects.create(
            household=household,
            user=self.user,
            role=HouseholdMember.Role.OWNER,
            visibility_level=HouseholdMember.VisibilityLevel.FULL_HOUSEHOLD,
        )
        Expense.objects.create(
            user=self.user,
            created_by=self.user,
            paid_by_user=self.user,
            title="Private Tea",
            amount="20.00",
            category=self.category,
            payment_method="cash",
            expense_date="2026-07-05",
        )
        Expense.objects.create(
            user=self.user,
            created_by=self.user,
            paid_by_user=self.user,
            household=household,
            title="House Power",
            amount="200.00",
            category=self.category,
            payment_method="upi",
            expense_date="2026-07-05",
            visibility=Expense.Visibility.HOUSEHOLD,
            expense_type=Expense.ExpenseType.HOUSEHOLD,
        )

        response = self.client.get(f"/api/households/{household.id}/reports/monthly-summary/?month=2026-07")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["total_spent"], "200.00")
        self.assertEqual(response.data["expense_count"], 1)

    def test_limited_viewer_gets_summary_but_not_detailed_expenses_or_export(self):
        viewer = User.objects.create_user(username="limited", email="limited@example.com", password="pass12345")
        household = Household.objects.create(owner=self.user, name="Limited Home", monthly_budget="5000.00")
        HouseholdMember.objects.create(
            household=household,
            user=self.user,
            role=HouseholdMember.Role.OWNER,
            visibility_level=HouseholdMember.VisibilityLevel.FULL_HOUSEHOLD,
        )
        HouseholdMember.objects.create(
            household=household,
            user=viewer,
            role=HouseholdMember.Role.VIEWER,
            visibility_level=HouseholdMember.VisibilityLevel.MONTHLY_SUMMARY,
        )
        Expense.objects.create(
            user=self.user,
            created_by=self.user,
            paid_by_user=self.user,
            household=household,
            title="House Power",
            amount="200.00",
            category=self.category,
            payment_method="upi",
            expense_date="2026-07-05",
            visibility=Expense.Visibility.HOUSEHOLD,
            expense_type=Expense.ExpenseType.HOUSEHOLD,
        )

        self.client.force_authenticate(viewer)

        expenses = self.client.get("/api/expenses/?month=2026-07")
        summary = self.client.get(f"/api/households/{household.id}/reports/monthly-summary/?month=2026-07")
        export = self.client.get(f"/api/households/{household.id}/reports/export-csv/?month=2026-07")

        self.assertEqual(expenses.status_code, 200)
        self.assertEqual(expenses.data, [])
        self.assertEqual(summary.status_code, 200)
        self.assertEqual(summary.data["total_spent"], "200.00")
        self.assertEqual(summary.data["member_share_breakdown"], [])
        self.assertEqual(export.status_code, 403)

    def test_overdue_detection_marks_old_occurrence(self):
        bill = RecurringBill.objects.create(
            user=self.user,
            name="Old Bill",
            category=self.category,
            amount="50.00",
            payment_method="upi",
            frequency=RecurringBill.Frequency.MONTHLY,
            due_day=1,
            next_due_date=date.today(),
        )
        occurrence = BillOccurrence.objects.create(
            recurring_bill=bill,
            due_date=timezone.localdate() - timedelta(days=1),
            amount="50.00",
        )

        occurrence.refresh_from_db()
        self.assertEqual(occurrence.status, BillOccurrence.Status.OVERDUE)


class IncomeTransactionApiTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="income-user",
            email="income@example.com",
            password="pass12345",
        )
        self.expense_category = ExpenseCategory.objects.create(
            user=self.user,
            name="Food",
            transaction_type=ExpenseCategory.TransactionType.EXPENSE,
        )
        self.income_category = ExpenseCategory.objects.create(
            user=self.user,
            name="Salary",
            transaction_type=ExpenseCategory.TransactionType.INCOME,
        )
        self.client.force_authenticate(self.user)

    def _create_income(self, amount="5000.00"):
        return self.client.post(
            "/api/transactions/",
            {
                "title": "July salary",
                "amount": amount,
                "transaction_type": "income",
                "category": self.income_category.id,
                "payment_method": "bank",
                "expense_date": "2026-07-05",
            },
            format="json",
        )

    def _create_expense(self, amount="1200.00"):
        return self.client.post(
            "/api/expenses/",
            {
                "title": "Groceries",
                "amount": amount,
                "category": self.expense_category.id,
                "payment_method": "upi",
                "expense_date": "2026-07-06",
            },
            format="json",
        )

    def test_income_increases_wallet_and_expense_decreases_it(self):
        income = self._create_income()
        expense = self._create_expense()

        self.assertEqual(income.status_code, 201)
        self.assertEqual(income.data["transaction_type"], Expense.TransactionType.INCOME)
        self.assertEqual(expense.status_code, 201)
        self.assertEqual(expense.data["transaction_type"], Expense.TransactionType.EXPENSE)

        summary = self.client.get("/api/reports/dashboard-summary/?month=2026-07")

        self.assertEqual(summary.status_code, 200)
        self.assertEqual(summary.data["summary"]["total_income"], "5000.00")
        self.assertEqual(summary.data["summary"]["total_expense"], "1200.00")
        self.assertEqual(summary.data["summary"]["net_cash_flow"], "3800.00")
        self.assertEqual(summary.data["summary"]["wallet_balance"], "3800.00")
        self.assertEqual(summary.data["summary"]["transaction_count"], 2)
        self.assertEqual(len(summary.data["recent_transactions"]), 2)
        self.assertEqual(len(summary.data["recent_expenses"]), 1)

    def test_transaction_endpoint_coexists_with_legacy_expense_endpoint(self):
        self._create_income()
        self._create_expense()

        transactions = self.client.get("/api/transactions/?month=2026-07")
        legacy_expenses = self.client.get("/api/expenses/?month=2026-07")
        income_only = self.client.get("/api/transactions/?month=2026-07&transaction_type=income")

        self.assertEqual(len(transactions.data), 2)
        self.assertEqual(len(legacy_expenses.data), 1)
        self.assertEqual(legacy_expenses.data[0]["transaction_type"], "expense")
        self.assertEqual(len(income_only.data), 1)
        self.assertEqual(income_only.data[0]["transaction_type"], "income")

    def test_income_category_and_sharing_rules_are_enforced(self):
        wrong_category = self.client.post(
            "/api/transactions/",
            {
                "title": "Salary",
                "amount": "5000.00",
                "transaction_type": "income",
                "category": self.expense_category.id,
                "payment_method": "bank",
                "expense_date": "2026-07-05",
            },
            format="json",
        )
        shared_income = self.client.post(
            "/api/transactions/",
            {
                "title": "Shared income",
                "amount": "5000.00",
                "transaction_type": "income",
                "category": self.income_category.id,
                "payment_method": "bank",
                "expense_date": "2026-07-05",
                "expense_type": "shared",
            },
            format="json",
        )
        zero_amount = self._create_income(amount="0.00")

        self.assertEqual(wrong_category.status_code, 400)
        self.assertIn("category", wrong_category.data)
        self.assertEqual(shared_income.status_code, 400)
        self.assertIn("expense_type", shared_income.data)
        self.assertEqual(zero_amount.status_code, 400)
        self.assertIn("amount", zero_amount.data)

    def test_category_endpoints_default_to_expense_for_old_clients(self):
        default_categories = self.client.get("/api/categories/")
        income_categories = self.client.get("/api/categories/?transaction_type=income")

        self.assertEqual([row["name"] for row in default_categories.data], ["Food"])
        self.assertEqual([row["name"] for row in income_categories.data], ["Salary"])

    def test_editing_or_deleting_income_recalculates_wallet(self):
        created = self._create_income()
        transaction_id = created.data["id"]
        updated = self.client.put(
            f"/api/transactions/{transaction_id}/",
            {
                "title": "July salary revised",
                "amount": "6000.00",
                "transaction_type": "income",
                "category": self.income_category.id,
                "payment_method": "bank",
                "expense_date": "2026-07-05",
            },
            format="json",
        )
        after_update = self.client.get("/api/reports/monthly-summary/?month=2026-07")
        deleted = self.client.delete(f"/api/transactions/{transaction_id}/")
        after_delete = self.client.get("/api/reports/monthly-summary/?month=2026-07")

        self.assertEqual(updated.status_code, 200)
        self.assertEqual(after_update.data["wallet_balance"], "6000.00")
        self.assertEqual(deleted.status_code, 204)
        self.assertEqual(after_delete.data["wallet_balance"], "0.00")

    def test_exports_include_both_transaction_directions(self):
        self._create_income()
        self._create_expense()

        csv_response = self.client.get("/api/reports/export-csv/?month=2026-07")
        pdf_response = self.client.get("/api/reports/export-pdf/?month=2026-07")
        csv_text = csv_response.content.decode("utf-8")

        self.assertEqual(csv_response.status_code, 200)
        self.assertIn("Date,Type,Title", csv_text)
        self.assertIn("Income,July salary", csv_text)
        self.assertIn("Expense,Groceries", csv_text)
        self.assertIn("sora-transactions-2026-07.csv", csv_response["Content-Disposition"])
        self.assertEqual(pdf_response.status_code, 200)
        self.assertTrue(pdf_response.content.startswith(b"%PDF"))
        self.assertIn("sora-transaction-report-2026-07.pdf", pdf_response["Content-Disposition"])
