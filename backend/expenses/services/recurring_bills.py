from calendar import monthrange
from datetime import date, timedelta

from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework import serializers

from expenses.models import BillOccurrence, Expense, RecurringBill
from expenses.services.privacy import can_create_household_expense, can_view_household
from expenses.services.reports import parse_month_range


def _add_months(value, months):
    month = value.month - 1 + months
    year = value.year + month // 12
    month = month % 12 + 1
    day = min(value.day, monthrange(year, month)[1])
    return date(year, month, day)


def _next_due_date(value, frequency):
    if frequency == RecurringBill.Frequency.WEEKLY:
        return value + timedelta(days=7)
    if frequency == RecurringBill.Frequency.YEARLY:
        return _add_months(value, 12)
    return _add_months(value, 1)


def _validate_scope(user, data):
    household = data.get("household")
    category = data.get("category")
    if household:
        if not can_create_household_expense(user, household):
            raise serializers.ValidationError("Viewer cannot create household expenses.")
        if category and category.user_id not in {user.id, household.owner_id}:
            raise serializers.ValidationError("Category is not allowed for this household.")
    else:
        if category and category.user_id != user.id:
            raise serializers.ValidationError("Category does not belong to this user.")


@transaction.atomic
def create_recurring_bill(user, data):
    payload = dict(data)
    _validate_scope(user, payload)
    if payload.get("household"):
        payload["user"] = None
    else:
        payload["user"] = user
    bill = RecurringBill.objects.create(**payload)
    generate_occurrences(bill, count=3)
    return bill


def generate_occurrences(recurring_bill, until_date=None, count=3):
    occurrences = []
    due_date = recurring_bill.next_due_date
    generated = 0
    while generated < count and (until_date is None or due_date <= until_date):
        occurrence, _ = BillOccurrence.objects.get_or_create(
            recurring_bill=recurring_bill,
            due_date=due_date,
            defaults={"amount": recurring_bill.amount},
        )
        occurrences.append(occurrence)
        due_date = _next_due_date(due_date, recurring_bill.frequency)
        generated += 1
    return occurrences


@transaction.atomic
def mark_occurrence_paid(user, occurrence, create_expense=True):
    bill = occurrence.recurring_bill
    if bill.household and not can_create_household_expense(user, bill.household):
        raise serializers.ValidationError("You do not have access to this household.")
    if bill.user_id and bill.user_id != user.id:
        raise serializers.ValidationError("You do not have access to this recurring bill.")

    expense = occurrence.paid_expense
    if create_expense and expense is None:
        expense = Expense.objects.create(
            user=user,
            created_by=user,
            household=bill.household,
            title=bill.name,
            amount=occurrence.amount,
            category=bill.category,
            payment_method=bill.payment_method,
            paid_by_user=user,
            expense_date=occurrence.due_date,
            note=bill.note,
            visibility=Expense.Visibility.HOUSEHOLD if bill.household else Expense.Visibility.PRIVATE,
            expense_type=Expense.ExpenseType.HOUSEHOLD if bill.household else Expense.ExpenseType.PERSONAL,
        )

    occurrence.status = BillOccurrence.Status.PAID
    occurrence.paid_expense = expense
    occurrence.paid_at = timezone.now()
    occurrence.save(update_fields=["status", "paid_expense", "paid_at", "updated_at"])
    return occurrence


def mark_occurrence_skipped(user, occurrence):
    bill = occurrence.recurring_bill
    if bill.household and not can_create_household_expense(user, bill.household):
        raise serializers.ValidationError("You do not have access to this household.")
    if bill.user_id and bill.user_id != user.id:
        raise serializers.ValidationError("You do not have access to this recurring bill.")
    occurrence.status = BillOccurrence.Status.SKIPPED
    occurrence.save(update_fields=["status", "updated_at"])
    return occurrence


def update_overdue_occurrences(user=None):
    queryset = BillOccurrence.objects.filter(
        status=BillOccurrence.Status.UPCOMING,
        due_date__lt=timezone.localdate(),
    )
    if user:
        queryset = queryset.filter(
            Q(recurring_bill__user=user)
            | Q(
                recurring_bill__household__members__user=user,
                recurring_bill__household__members__status="active",
            )
        ).distinct()
    return queryset.update(status=BillOccurrence.Status.OVERDUE)


def get_bill_calendar(user, month, household=None):
    start, end = parse_month_range(month)
    queryset = BillOccurrence.objects.select_related("recurring_bill", "recurring_bill__category").filter(
        due_date__range=(start, end)
    )
    if household:
        if not can_view_household(user, household):
            raise serializers.ValidationError("You do not have access to this household.")
        queryset = queryset.filter(recurring_bill__household=household)
    else:
        queryset = queryset.filter(recurring_bill__user=user)
    return queryset.order_by("due_date", "id")
