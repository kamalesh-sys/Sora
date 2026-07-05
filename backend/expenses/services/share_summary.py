from decimal import Decimal

from rest_framework import serializers

from expenses.models import Expense, ExpenseShare
from expenses.services.household_reports import get_household_monthly_report
from expenses.services.privacy import can_view_expense, can_view_person
from expenses.services.reports import parse_month_range
from expenses.services.splits import money


def build_household_share_summary(user, household, month):
    report = get_household_monthly_report(user, household, month)
    lines = [
        f"{report['month']} {report['household']['name']} Expenses",
        "",
        f"Total spent: INR {report['total_spent']}",
        f"Budget: INR {report['household_budget']}",
        f"Remaining: INR {report['remaining']}",
        "",
        "Top categories:",
    ]
    for row in report["category_breakdown"][:5]:
        lines.append(f"- {row['category_name']}: INR {row['total']}")
    lines.extend(["", "Pending:"])
    if report["pending_settlements"]:
        for row in report["pending_settlements"][:10]:
            lines.append(f"- {row['name']} owes INR {row['pending_amount']}")
    else:
        lines.append("- No pending settlements")
    return "\n".join(lines)


def build_expense_share_summary(user, expense):
    if not can_view_expense(user, expense):
        raise serializers.ValidationError("You do not have access to this expense.")
    lines = [
        f"{expense.title}",
        f"Amount: INR {money(expense.amount)}",
        f"Date: {expense.expense_date.isoformat()}",
        "",
        "Shares:",
    ]
    shares = expense.shares.select_related("person", "user")
    if not shares.exists():
        lines.append("- No shares")
    for share in shares:
        name = share.user.get_full_name() if share.user_id else share.person.name if share.person_id else "Member"
        lines.append(
            f"- {name}: INR {money(share.share_amount)} "
            f"(paid INR {money(share.paid_amount)}, {share.status})"
        )
    return "\n".join(lines)


def build_person_share_summary(user, person, month=None):
    if not can_view_person(user, person):
        raise serializers.ValidationError("You do not have access to this person.")

    shares = ExpenseShare.objects.select_related("expense").filter(person=person)
    if month:
        start, end = parse_month_range(month)
        shares = shares.filter(expense__expense_date__range=(start, end))

    total_share = sum((share.share_amount for share in shares), Decimal("0.00"))
    total_paid = sum((share.paid_amount for share in shares), Decimal("0.00"))
    pending = total_share - total_paid
    label = month or "All time"
    lines = [
        f"{label} Share Summary for {person.name}",
        "",
        f"Total share: INR {money(total_share)}",
        f"Paid: INR {money(total_paid)}",
        f"Pending: INR {money(pending)}",
    ]
    return "\n".join(lines)
