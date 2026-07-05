import csv
from decimal import Decimal
from io import BytesIO, StringIO

from django.db.models import Count, Sum
from reportlab.lib import colors
from reportlab.lib.pagesizes import landscape, letter
from reportlab.lib.units import inch
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet
from rest_framework import serializers

from expenses.models import BillOccurrence, Expense, ExpenseShare, HouseholdMember
from expenses.services.budgets import get_category_budget_usage
from expenses.services.privacy import can_view_household, get_active_household_member
from expenses.services.reports import parse_month_range
from expenses.services.splits import money


def _decimal(value):
    return value or Decimal("0.00")


def get_household_monthly_report(user, household, month):
    if not can_view_household(user, household):
        raise serializers.ValidationError("You do not have access to this household.")

    member = get_active_household_member(user, household)
    limited_viewer = bool(
        member
        and member.role == HouseholdMember.Role.VIEWER
        and member.visibility_level != HouseholdMember.VisibilityLevel.FULL_HOUSEHOLD
    )
    start, end = parse_month_range(month)
    expenses = Expense.objects.select_related("category", "paid_by_user", "paid_by_person").filter(
        household=household,
        expense_date__range=(start, end),
    )
    total_spent = _decimal(expenses.aggregate(total=Sum("amount"))["total"])
    budget = household.monthly_budget or Decimal("0.00")

    category_breakdown = [
        {
            "category_id": row["category_id"],
            "category_name": row["category__name"] or "Uncategorized",
            "total": str(money(row["total"])),
            "count": row["count"],
        }
        for row in expenses.values("category_id", "category__name")
        .annotate(total=Sum("amount"), count=Count("id"))
        .order_by("-total")
    ]
    payment_method_breakdown = [
        {
            "payment_method": row["payment_method"],
            "total": str(money(row["total"])),
            "count": row["count"],
        }
        for row in expenses.values("payment_method")
        .annotate(total=Sum("amount"), count=Count("id"))
        .order_by("-total")
    ]
    paid_by_breakdown = []
    for expense in expenses:
        if expense.paid_by_user_id:
            name = expense.paid_by_user.get_full_name() or expense.paid_by_user.email
        elif expense.paid_by_person_id:
            name = expense.paid_by_person.name
        else:
            name = "Unknown"
        paid_by_breakdown.append({"name": name, "amount": str(money(expense.amount))})

    shares = ExpenseShare.objects.select_related("person", "user").filter(expense__in=expenses)
    member_share_breakdown = [
        {
            "share_id": share.id,
            "name": share.user.get_full_name()
            if share.user_id
            else share.person.name
            if share.person_id
            else "Member",
            "share_amount": str(money(share.share_amount)),
            "paid_amount": str(money(share.paid_amount)),
            "pending_amount": str(money(share.share_amount - share.paid_amount)),
            "status": share.status,
        }
        for share in shares
    ]
    pending_settlements = [
        row for row in member_share_breakdown if Decimal(str(row["pending_amount"])) > 0
    ]

    occurrences = BillOccurrence.objects.select_related("recurring_bill").filter(
        recurring_bill__household=household,
        due_date__range=(start, end),
    )
    recurring_bills = {
        "paid": [o.id for o in occurrences if o.status == BillOccurrence.Status.PAID],
        "unpaid": [o.id for o in occurrences if o.status == BillOccurrence.Status.UPCOMING],
        "overdue": [o.id for o in occurrences if o.status == BillOccurrence.Status.OVERDUE],
    }

    report = {
        "household": {"id": household.id, "name": household.name},
        "month": start.strftime("%Y-%m"),
        "total_spent": str(money(total_spent)),
        "household_budget": str(money(budget)),
        "remaining": str(money(budget - total_spent)),
        "expense_count": expenses.count(),
        "category_breakdown": category_breakdown,
        "payment_method_breakdown": payment_method_breakdown,
        "paid_by_breakdown": paid_by_breakdown,
        "member_share_breakdown": member_share_breakdown,
        "pending_settlements": pending_settlements,
        "recurring_bills": recurring_bills,
        "category_budget_usage": get_category_budget_usage(user, start.strftime("%Y-%m"), household=household)["rows"],
    }
    if limited_viewer:
        report["paid_by_breakdown"] = []
        report["member_share_breakdown"] = []
        report["pending_settlements"] = []
        report["recurring_bills"] = {"paid": [], "unpaid": [], "overdue": []}
    return report


def build_household_monthly_report_csv(report_data):
    output = StringIO()
    writer = csv.writer(output)
    writer.writerow(["Household", report_data["household"]["name"]])
    writer.writerow(["Month", report_data["month"]])
    writer.writerow(["Total Spent", report_data["total_spent"]])
    writer.writerow(["Budget", report_data["household_budget"]])
    writer.writerow(["Remaining", report_data["remaining"]])
    writer.writerow([])
    writer.writerow(["Category", "Amount", "Count"])
    for row in report_data["category_breakdown"]:
        writer.writerow([row["category_name"], row["total"], row["count"]])
    writer.writerow([])
    writer.writerow(["Pending", "Share Amount", "Paid Amount", "Pending Amount", "Status"])
    for row in report_data["pending_settlements"]:
        writer.writerow([row["name"], row["share_amount"], row["paid_amount"], row["pending_amount"], row["status"]])
    return output.getvalue()


def build_household_monthly_report_pdf(report_data):
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=landscape(letter),
        leftMargin=0.5 * inch,
        rightMargin=0.5 * inch,
        topMargin=0.5 * inch,
        bottomMargin=0.5 * inch,
    )
    styles = getSampleStyleSheet()
    story = [
        Paragraph(f"{report_data['household']['name']} Household Report", styles["Title"]),
        Spacer(1, 0.15 * inch),
        _table(
            [
                ["Month", "Total Spent", "Budget", "Remaining", "Expense Count"],
                [
                    report_data["month"],
                    report_data["total_spent"],
                    report_data["household_budget"],
                    report_data["remaining"],
                    str(report_data["expense_count"]),
                ],
            ]
        ),
        Spacer(1, 0.2 * inch),
        Paragraph("Category Breakdown", styles["Heading2"]),
        _table(
            [["Category", "Amount", "Count"]]
            + [[r["category_name"], r["total"], str(r["count"])] for r in report_data["category_breakdown"]]
        ),
        Spacer(1, 0.2 * inch),
        Paragraph("Pending Settlements", styles["Heading2"]),
        _table(
            [["Name", "Share", "Paid", "Pending", "Status"]]
            + [
                [r["name"], r["share_amount"], r["paid_amount"], r["pending_amount"], r["status"]]
                for r in report_data["pending_settlements"]
            ]
        ),
    ]
    doc.build(story)
    content = buffer.getvalue()
    buffer.close()
    return content


def _table(rows):
    if len(rows) == 1:
        rows.append(["No data", "", "", "", ""][: len(rows[0])])
    table = Table(rows, repeatRows=1)
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1f2937")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#d1d5db")),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f9fafb")]),
            ]
        )
    )
    return table
