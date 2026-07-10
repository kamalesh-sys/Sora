from datetime import date
from decimal import Decimal

from django.db.models import Sum
from django.utils.dateparse import parse_date
from rest_framework import serializers

from expenses.models import CategoryBudget, Expense
from expenses.services.privacy import can_create_household_expense
from expenses.services.reports import parse_month_range
from expenses.services.splits import money


def get_month_start(value):
    if isinstance(value, date):
        return value.replace(day=1)
    if isinstance(value, str):
        if len(value) == 7:
            start, _ = parse_month_range(value)
            return start
        parsed = parse_date(value)
        if parsed:
            return parsed.replace(day=1)
    raise serializers.ValidationError("Month must use YYYY-MM or YYYY-MM-DD format.")


def create_or_update_category_budget(user, data):
    payload = dict(data)
    household = payload.get("household")
    category = payload["category"]
    if category.transaction_type != category.TransactionType.EXPENSE:
        raise serializers.ValidationError("Budgets require an expense category.")
    month = get_month_start(payload["month"])

    if household:
        if not can_create_household_expense(user, household):
            raise serializers.ValidationError("You do not have access to this household.")
        lookup = {"household": household, "category": category, "month": month}
        payload["user"] = None
    else:
        if category.user_id != user.id:
            raise serializers.ValidationError("Category does not belong to this user.")
        lookup = {"user": user, "category": category, "month": month}
        payload["household"] = None

    payload["month"] = month
    budget, _ = CategoryBudget.objects.update_or_create(
        defaults={"amount": payload["amount"], "note": payload.get("note", "")},
        **lookup,
    )
    return budget


def get_category_budget_usage(user, month, household=None):
    start, end = parse_month_range(month if isinstance(month, str) else month.strftime("%Y-%m"))
    if household:
        budgets = CategoryBudget.objects.select_related("category").filter(household=household, month=start)
        expense_filter = {"household": household, "expense_date__range": (start, end)}
    else:
        budgets = CategoryBudget.objects.select_related("category").filter(user=user, month=start)
        expense_filter = {
            "user": user,
            "household__isnull": True,
            "expense_date__range": (start, end),
        }

    rows = []
    for budget in budgets:
        spent = (
            Expense.objects.filter(
                category=budget.category,
                transaction_type=Expense.TransactionType.EXPENSE,
                **expense_filter,
            ).aggregate(total=Sum("amount"))["total"]
            or Decimal("0.00")
        )
        remaining = budget.amount - spent
        used_percent = Decimal("0.00")
        if budget.amount > 0:
            used_percent = ((spent / budget.amount) * Decimal("100")).quantize(Decimal("0.01"))
        if used_percent > 100:
            status = "exceeded"
        elif used_percent >= 75:
            status = "careful"
        else:
            status = "safe"
        rows.append(
            {
                "category_id": budget.category_id,
                "category_name": budget.category.name,
                "budget_amount": str(money(budget.amount)),
                "spent_amount": str(money(spent)),
                "remaining_amount": str(money(remaining)),
                "used_percent": str(money(used_percent)),
                "status": status,
            }
        )
    return {"month": start.strftime("%Y-%m"), "rows": rows}


def get_budget_warnings(user, month, household=None):
    usage = get_category_budget_usage(user, month, household=household)
    return [row for row in usage["rows"] if row["status"] in {"careful", "exceeded"}]
