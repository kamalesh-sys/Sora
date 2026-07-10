import calendar
from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import SimpleTestCase, override_settings
from django.utils import timezone
from rest_framework.test import APITestCase

from expenses.models import Expense, Goal, GoalContribution
from expenses.services.goals import (
    calculate_goal_metrics,
    month_start,
    synchronize_goal_completion,
)


User = get_user_model()


def add_months(value, count):
    month_index = (value.year * 12) + value.month - 1 + count
    return date(month_index // 12, (month_index % 12) + 1, 1)


def month_end(value):
    return date(value.year, value.month, calendar.monthrange(value.year, value.month)[1])


class GoalCalculationTests(SimpleTestCase):
    def test_schedule_uses_decimal_math_and_excludes_skipped_months(self):
        metrics = calculate_goal_metrics(
            target_amount=Decimal("1200.00"),
            target_date=date(2026, 6, 30),
            start_date=date(2026, 1, 15),
            saved_amount=Decimal("350.00"),
            skipped_months=[date(2026, 4, 1)],
            status=Goal.Status.ACTIVE,
            as_of=date(2026, 3, 10),
        )

        self.assertEqual(metrics.saved_amount, Decimal("350.00"))
        self.assertEqual(metrics.remaining_amount, Decimal("850.00"))
        self.assertEqual(metrics.progress_percent, Decimal("29.17"))
        self.assertEqual(metrics.remaining_month_count, 3)
        self.assertEqual(metrics.required_monthly_contribution, Decimal("283.34"))
        self.assertEqual(metrics.expected_saved_amount, Decimal("480.00"))
        self.assertEqual(metrics.shortfall_amount, Decimal("130.00"))
        self.assertEqual(metrics.health_status, "at_risk")
        self.assertTrue(metrics.can_skip_current_month)

    def test_overdue_and_completed_health_states_are_explicit(self):
        overdue = calculate_goal_metrics(
            target_amount=Decimal("1000.00"),
            target_date=date(2026, 2, 28),
            start_date=date(2026, 1, 1),
            saved_amount=Decimal("250.00"),
            status=Goal.Status.ACTIVE,
            as_of=date(2026, 3, 1),
        )
        completed = calculate_goal_metrics(
            target_amount=Decimal("1000.00"),
            target_date=date(2026, 5, 31),
            start_date=date(2026, 1, 1),
            saved_amount=Decimal("1000.00"),
            status=Goal.Status.COMPLETED,
            as_of=date(2026, 3, 1),
        )

        self.assertEqual(overdue.health_status, "overdue")
        self.assertEqual(overdue.remaining_month_count, 0)
        self.assertEqual(overdue.required_monthly_contribution, Decimal("750.00"))
        self.assertFalse(overdue.can_skip_current_month)
        self.assertEqual(completed.health_status, "completed")
        self.assertEqual(completed.remaining_amount, Decimal("0.00"))
        self.assertEqual(completed.required_monthly_contribution, Decimal("0.00"))


@override_settings(SECURE_SSL_REDIRECT=False)
class GoalApiTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="goal-owner",
            email="goals@example.com",
            password="pass12345",
        )
        self.other = User.objects.create_user(
            username="other-goal-owner",
            email="other-goals@example.com",
            password="pass12345",
        )
        self.client.force_authenticate(self.user)
        self.today = timezone.localdate()
        self.target_date = month_end(add_months(self.today, 2))

    def create_goal(self, **overrides):
        payload = {
            "name": "Emergency cushion",
            "target_amount": "900.00",
            "target_date": self.target_date.isoformat(),
            "template_key": "emergency_fund",
        }
        payload.update(overrides)
        return self.client.post("/api/goals/", payload, format="json")

    def test_create_list_update_and_personal_ownership(self):
        other_goal = Goal.objects.create(
            user=self.other,
            name="Hidden goal",
            target_amount=Decimal("500.00"),
            target_date=self.target_date,
        )

        response = self.create_goal(description="Three months of essentials")

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["status"], "active")
        self.assertEqual(response.data["health_status"], "on_track")
        self.assertEqual(response.data["saved_amount"], "0.00")
        self.assertEqual(response.data["remaining_amount"], "900.00")
        self.assertEqual(response.data["remaining_month_count"], 3)
        self.assertEqual(response.data["required_monthly_contribution"], "300.00")
        self.assertEqual(response.data["icon"], "shield-check")
        self.assertEqual(response.data["color"], "#2E7D5B")
        self.assertEqual(response.data["contributions"], [])
        self.assertEqual(response.data["skipped_months"], [])

        list_response = self.client.get("/api/goals/")
        self.assertEqual(list_response.status_code, 200)
        self.assertEqual([row["id"] for row in list_response.data], [response.data["id"]])
        self.assertEqual(self.client.get(f"/api/goals/{other_goal.id}/").status_code, 404)

        patch_response = self.client.patch(
            f"/api/goals/{response.data['id']}/",
            {"name": "Family emergency cushion"},
            format="json",
        )
        self.assertEqual(patch_response.status_code, 200)
        self.assertEqual(patch_response.data["name"], "Family emergency cushion")

    def test_contributions_keep_history_and_complete_goal(self):
        goal_id = self.create_goal(target_amount="1000.00").data["id"]

        first = self.client.post(
            f"/api/goals/{goal_id}/contributions/",
            {
                "amount": "400.00",
                "add_to_expenses": True,
                "contribution_date": self.today.isoformat(),
                "note": "First transfer",
            },
            format="json",
        )
        second = self.client.post(
            f"/api/goals/{goal_id}/contributions/",
            {"amount": "600.00", "contribution_date": self.today.isoformat()},
            format="json",
        )

        self.assertEqual(first.status_code, 201)
        self.assertFalse(first.data["just_completed"])
        self.assertEqual(first.data["goal"]["saved_amount"], "400.00")
        self.assertIsNotNone(first.data["contribution"]["expense"])
        linked_expense = Expense.objects.get(pk=first.data["contribution"]["expense"])
        self.assertEqual(linked_expense.amount, Decimal("400.00"))
        self.assertEqual(linked_expense.expense_date, self.today)
        self.assertEqual(second.status_code, 201)
        self.assertTrue(second.data["just_completed"])
        self.assertEqual(second.data["goal"]["status"], "completed")
        self.assertEqual(second.data["goal"]["health_status"], "completed")
        self.assertEqual(second.data["goal"]["progress_percent"], "100.00")
        self.assertIsNotNone(second.data["goal"]["completed_at"])

        history = self.client.get(f"/api/goals/{goal_id}/contributions/")
        self.assertEqual(history.status_code, 200)
        self.assertEqual(len(history.data), 2)
        self.assertEqual(history.data[0]["amount"], "600.00")

    def test_editing_and_deleting_contributions_recalculates_completion(self):
        goal_id = self.create_goal(target_amount="500.00").data["id"]
        created = self.client.post(
            f"/api/goals/{goal_id}/contributions/",
            {"amount": "500.00"},
            format="json",
        )
        contribution_id = created.data["contribution"]["id"]

        edited = self.client.patch(
            f"/api/goals/{goal_id}/contributions/{contribution_id}/",
            {"amount": "300.00"},
            format="json",
        )

        self.assertEqual(edited.status_code, 200)
        self.assertEqual(edited.data["goal"]["status"], "active")
        self.assertEqual(edited.data["goal"]["saved_amount"], "300.00")
        self.assertIsNone(edited.data["goal"]["completed_at"])

        deleted = self.client.delete(
            f"/api/goals/{goal_id}/contributions/{contribution_id}/"
        )
        self.assertEqual(deleted.status_code, 200)
        self.assertEqual(deleted.data["goal"]["saved_amount"], "0.00")
        self.assertFalse(GoalContribution.objects.filter(pk=contribution_id).exists())

    def test_deleting_a_linked_contribution_removes_its_expense(self):
        goal_id = self.create_goal(target_amount="500.00").data["id"]
        created = self.client.post(
            f"/api/goals/{goal_id}/contributions/",
            {
                "amount": "125.00",
                "add_to_expenses": True,
                "contribution_date": self.today.isoformat(),
            },
            format="json",
        )

        self.assertEqual(created.status_code, 201)
        contribution_id = created.data["contribution"]["id"]
        expense_id = created.data["contribution"]["expense"]
        self.assertTrue(Expense.objects.filter(pk=expense_id).exists())

        deleted = self.client.delete(
            f"/api/goals/{goal_id}/contributions/{contribution_id}/"
        )

        self.assertEqual(deleted.status_code, 200)
        self.assertFalse(Expense.objects.filter(pk=expense_id).exists())

    def test_target_edit_can_complete_and_reopen_goal(self):
        goal_id = self.create_goal(target_amount="1000.00").data["id"]
        self.client.post(
            f"/api/goals/{goal_id}/contributions/",
            {"amount": "500.00"},
            format="json",
        )

        completed = self.client.patch(
            f"/api/goals/{goal_id}/",
            {"target_amount": "400.00"},
            format="json",
        )
        reopened = self.client.patch(
            f"/api/goals/{goal_id}/",
            {"target_amount": "1200.00"},
            format="json",
        )

        self.assertEqual(completed.status_code, 200)
        self.assertEqual(completed.data["status"], "completed")
        self.assertEqual(reopened.status_code, 200)
        self.assertEqual(reopened.data["status"], "active")
        self.assertIsNone(reopened.data["completed_at"])

    def test_completed_goal_accepts_unchanged_past_target_from_full_form(self):
        goal = Goal.objects.create(
            user=self.user,
            name="Finished goal",
            target_amount=Decimal("500.00"),
            target_date=date(self.today.year - 1, self.today.month, 1),
        )
        GoalContribution.objects.create(
            goal=goal,
            amount=Decimal("500.00"),
            contribution_date=self.today,
        )
        synchronize_goal_completion(goal)

        response = self.client.patch(
            f"/api/goals/{goal.id}/",
            {
                "name": "Finished family goal",
                "target_date": goal.target_date.isoformat(),
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["name"], "Finished family goal")
        self.assertEqual(response.data["status"], "completed")

    def test_skip_and_remove_skip_recalculate_monthly_amount(self):
        goal_id = self.create_goal().data["id"]

        skipped = self.client.post(
            f"/api/goals/{goal_id}/skip/",
            {"month": self.today.strftime("%Y-%m")},
            format="json",
        )

        self.assertEqual(skipped.status_code, 201)
        self.assertEqual(skipped.data["skip"]["month"], month_start(self.today).isoformat())
        self.assertEqual(skipped.data["goal"]["remaining_month_count"], 2)
        self.assertEqual(skipped.data["goal"]["required_monthly_contribution"], "450.00")
        self.assertFalse(skipped.data["goal"]["can_skip_current_month"])

        restored = self.client.delete(
            f"/api/goals/{goal_id}/skips/{skipped.data['skip']['id']}/"
        )
        self.assertEqual(restored.status_code, 200)
        self.assertEqual(restored.data["goal"]["remaining_month_count"], 3)
        self.assertEqual(restored.data["goal"]["required_monthly_contribution"], "300.00")

    def test_last_month_duplicate_and_past_skips_are_rejected(self):
        one_month_goal = self.create_goal(
            name="This month",
            target_date=month_end(self.today).isoformat(),
        )
        goal_id = one_month_goal.data["id"]

        last_month = self.client.post(
            f"/api/goals/{goal_id}/skip/",
            {"month": self.today.strftime("%Y-%m")},
            format="json",
        )
        self.assertEqual(last_month.status_code, 400)

        multi_month_goal_id = self.create_goal(name="Flexible goal").data["id"]
        first = self.client.post(
            f"/api/goals/{multi_month_goal_id}/skip/",
            {"month": self.today.strftime("%Y-%m")},
            format="json",
        )
        duplicate = self.client.post(
            f"/api/goals/{multi_month_goal_id}/skip/",
            {"month": self.today.strftime("%Y-%m")},
            format="json",
        )
        previous_month = add_months(self.today, -1)
        past = self.client.post(
            f"/api/goals/{multi_month_goal_id}/skip/",
            {"month": previous_month.strftime("%Y-%m")},
            format="json",
        )

        self.assertEqual(first.status_code, 201)
        self.assertEqual(duplicate.status_code, 400)
        self.assertEqual(past.status_code, 400)

    def test_templates_and_validation_contract(self):
        templates = self.client.get("/api/goals/templates/")
        invalid_template = self.create_goal(template_key="crypto_moon")
        past_goal = self.create_goal(
            target_date=date(self.today.year - 1, self.today.month, 1).isoformat()
        )

        self.assertEqual(templates.status_code, 200)
        self.assertGreaterEqual(len(templates.data), 7)
        self.assertEqual(
            set(templates.data[0]),
            {"key", "name", "description", "icon", "color", "suggested_months"},
        )
        self.assertEqual(invalid_template.status_code, 400)
        self.assertEqual(past_goal.status_code, 400)

    def test_other_users_cannot_reach_nested_goal_resources(self):
        other_goal = Goal.objects.create(
            user=self.other,
            name="Private goal",
            target_amount=Decimal("500.00"),
            target_date=self.target_date,
        )

        response = self.client.post(
            f"/api/goals/{other_goal.id}/contributions/",
            {"amount": "100.00"},
            format="json",
        )

        self.assertEqual(response.status_code, 404)
        self.assertFalse(other_goal.contributions.exists())
