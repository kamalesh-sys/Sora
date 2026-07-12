from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APITestCase

from expenses.models import ExpenseCategory, Loan
from expenses.services.loans import get_loan_metrics


User = get_user_model()


class LoanApiTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="loan-owner",
            email="loans@example.com",
            password="pass12345",
        )
        self.other = User.objects.create_user(
            username="other-loan-owner",
            email="other-loans@example.com",
            password="pass12345",
        )
        self.client.force_authenticate(self.user)
        self.today = timezone.localdate()

    def create_loan(self, **overrides):
        payload = {
            "direction": "borrowed",
            "name": "Emergency family loan",
            "counterparty_name": "Asha",
            "loan_type": "personal",
            "principal_amount": "1000.00",
            "annual_interest_rate": "0.0000",
            "interest_type": "none",
            "disbursed_date": (self.today - timedelta(days=30)).isoformat(),
            "repayment_frequency": "monthly",
            "planned_payment_amount": "250.00",
            "next_due_date": (self.today + timedelta(days=1)).isoformat(),
            "reference_number": "FAM-2026-01",
            "note": "Keep the payment receipt.",
        }
        payload.update(overrides)
        return self.client.post("/api/loans/", payload, format="json")

    def test_create_list_and_keep_loans_private_to_the_owner(self):
        Loan.objects.create(
            user=self.other,
            direction=Loan.Direction.LENT,
            name="Other user's loan",
            counterparty_name="Hidden person",
            principal_amount=Decimal("500.00"),
            disbursed_date=self.today,
        )

        response = self.create_loan()

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["outstanding_principal"], "1000.00")
        self.assertEqual(response.data["display_status"], "active")
        self.assertEqual(response.data["payments"], [])
        self.assertEqual(response.data["reference_number"], "FAM-2026-01")
        self.assertEqual(
            [row["id"] for row in self.client.get("/api/loans/").data],
            [response.data["id"]],
        )
        self.assertEqual(self.client.get("/api/loans/?direction=lent").data, [])

    def test_auto_allocation_applies_simple_interest_before_principal(self):
        loan_response = self.create_loan(
            annual_interest_rate="36.0000",
            interest_type="simple",
        )
        self.assertEqual(loan_response.status_code, 201)
        loan_id = loan_response.data["id"]

        payment_response = self.client.post(
            f"/api/loans/{loan_id}/payments/",
            {"amount": "100.00", "payment_date": self.today.isoformat(), "payment_method": "upi"},
            format="json",
        )

        self.assertEqual(payment_response.status_code, 201)
        payment = payment_response.data["payment"]
        self.assertEqual(payment["interest_amount"], "29.59")
        self.assertEqual(payment["principal_amount"], "70.41")
        self.assertEqual(payment["fee_amount"], "0.00")
        self.assertEqual(payment_response.data["loan"]["outstanding_principal"], "929.59")
        self.assertEqual(payment_response.data["loan"]["outstanding_interest"], "0.00")

        loan = Loan.objects.get(pk=loan_id)
        metrics = get_loan_metrics(loan, as_of=self.today)
        self.assertEqual(metrics.principal_paid, Decimal("70.41"))
        self.assertEqual(metrics.interest_paid, Decimal("29.59"))

    def test_manual_allocations_require_a_balanced_payment_and_cannot_overpay_principal(self):
        loan_id = self.create_loan().data["id"]

        unbalanced = self.client.post(
            f"/api/loans/{loan_id}/payments/",
            {
                "amount": "100.00",
                "principal_amount": "90.00",
                "interest_amount": "0.00",
                "fee_amount": "0.00",
            },
            format="json",
        )
        overpaid = self.client.post(
            f"/api/loans/{loan_id}/payments/",
            {
                "amount": "1001.00",
                "principal_amount": "1001.00",
                "interest_amount": "0.00",
                "fee_amount": "0.00",
            },
            format="json",
        )

        self.assertEqual(unbalanced.status_code, 400)
        self.assertEqual(overpaid.status_code, 400)

    def test_full_payment_closes_loan_and_deleting_it_reopens_the_ledger(self):
        loan_id = self.create_loan(principal_amount="200.00").data["id"]
        paid = self.client.post(
            f"/api/loans/{loan_id}/payments/",
            {"amount": "200.00", "payment_date": self.today.isoformat()},
            format="json",
        )
        self.assertEqual(paid.status_code, 201)
        self.assertEqual(paid.data["loan"]["status"], "closed")
        self.assertEqual(paid.data["loan"]["display_status"], "closed")

        closed_payment = self.client.post(
            f"/api/loans/{loan_id}/payments/",
            {"amount": "1.00", "payment_date": self.today.isoformat()},
            format="json",
        )
        self.assertEqual(closed_payment.status_code, 400)

        payment_id = paid.data["payment"]["id"]
        deleted = self.client.delete(f"/api/loans/{loan_id}/payments/{payment_id}/")
        self.assertEqual(deleted.status_code, 200)
        self.assertEqual(deleted.data["loan"]["status"], "active")
        self.assertEqual(deleted.data["loan"]["outstanding_principal"], "200.00")

    def test_loan_with_repayments_cannot_be_deleted(self):
        loan_id = self.create_loan(principal_amount="200.00").data["id"]
        self.client.post(f"/api/loans/{loan_id}/payments/", {"amount": "20.00"}, format="json")

        self.assertEqual(self.client.delete(f"/api/loans/{loan_id}/").status_code, 400)

        empty_loan_id = self.create_loan(name="No repayments yet").data["id"]
        self.assertEqual(self.client.delete(f"/api/loans/{empty_loan_id}/").status_code, 204)


class IncomeCategoryDetailTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="income-category-owner",
            email="income-category@example.com",
            password="pass12345",
        )
        self.client.force_authenticate(self.user)

    def test_income_category_can_be_updated_and_deleted_without_an_expense_query_filter(self):
        category = ExpenseCategory.objects.create(
            user=self.user,
            name="Project income",
            icon="briefcase-outline",
            color="#2E7D5B",
            transaction_type=ExpenseCategory.TransactionType.INCOME,
        )

        updated = self.client.patch(
            f"/api/categories/{category.id}/",
            {"name": "Client income"},
            format="json",
        )
        deleted = self.client.delete(f"/api/categories/{category.id}/")

        self.assertEqual(updated.status_code, 200)
        self.assertEqual(updated.data["transaction_type"], "income")
        self.assertEqual(deleted.status_code, 204)
        self.assertFalse(ExpenseCategory.objects.filter(pk=category.id).exists())
