import csv
from calendar import monthrange
from datetime import date
from decimal import Decimal
from io import BytesIO, StringIO
from xml.sax.saxutils import escape

from django.utils import timezone
from django.db.models import Count, Q, Sum
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_RIGHT
from reportlab.lib.pagesizes import landscape, letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from expenses.models import Expense, MonthlyBudget


def money(value):
    amount = value or Decimal("0.00")
    return str(amount.quantize(Decimal("0.01")))


def display_money(value):
    return f"INR {money(Decimal(str(value or '0.00')))}"


def parse_month_range(value):
    if not value:
        raise ValueError("month query parameter is required in YYYY-MM format.")

    try:
        year_text, month_text = value.split("-", 1)
        start = date(int(year_text), int(month_text), 1)
    except (TypeError, ValueError):
        raise ValueError("month must use YYYY-MM format.")

    end = date(start.year, start.month, monthrange(start.year, start.month)[1])
    return start, end


def get_monthly_transactions(start, end, user=None):
    queryset = Expense.objects.select_related("category").filter(
        expense_date__range=(start, end)
    ).exclude(expense_type=Expense.ExpenseType.SHARED)
    if user is not None:
        queryset = queryset.filter(user=user, household__isnull=True)
    return queryset


def get_monthly_expenses(start, end, user=None):
    return get_monthly_transactions(start, end, user=user).filter(
        transaction_type=Expense.TransactionType.EXPENSE
    )


def get_monthly_income(start, end, user=None):
    return get_monthly_transactions(start, end, user=user).filter(
        transaction_type=Expense.TransactionType.INCOME
    )


def get_wallet_balance(user=None):
    transactions = Expense.objects.all()
    income = transactions.filter(transaction_type=Expense.TransactionType.INCOME)
    expenses = transactions.filter(transaction_type=Expense.TransactionType.EXPENSE)
    if user is not None:
        income = income.filter(user=user)
        expenses = expenses.filter(Q(paid_by_user=user) | Q(user=user, paid_by_user__isnull=True))
    total_income = (
        income
        .aggregate(total=Sum("amount"))["total"]
        or Decimal("0.00")
    )
    total_expense = (
        expenses
        .aggregate(total=Sum("amount"))["total"]
        or Decimal("0.00")
    )
    return total_income - total_expense


def get_monthly_report_data(start, end, user=None):
    expenses = get_monthly_expenses(start, end, user=user)
    income = get_monthly_income(start, end, user=user)
    budgets = MonthlyBudget.objects.filter(month=start)
    if user is not None:
        budgets = budgets.filter(user=user)

    total_expense = expenses.aggregate(total=Sum("amount"))["total"] or Decimal("0.00")
    total_income = income.aggregate(total=Sum("amount"))["total"] or Decimal("0.00")
    total_budget = budgets.aggregate(total=Sum("amount"))["total"] or Decimal("0.00")
    balance = total_budget - total_expense
    net_cash_flow = total_income - total_expense

    category_rows = (
        expenses.values("category_id", "category__name")
        .annotate(total=Sum("amount"), count=Count("id"))
        .order_by("-total", "category__name")
    )
    payment_method_rows = (
        expenses.values("payment_method")
        .annotate(total=Sum("amount"), count=Count("id"))
        .order_by("-total", "payment_method")
    )
    income_category_rows = (
        income.values("category_id", "category__name")
        .annotate(total=Sum("amount"), count=Count("id"))
        .order_by("-total", "category__name")
    )
    income_payment_method_rows = (
        income.values("payment_method")
        .annotate(total=Sum("amount"), count=Count("id"))
        .order_by("-total", "payment_method")
    )

    return {
        "month": start.strftime("%Y-%m"),
        "total_expense": money(total_expense),
        "total_income": money(total_income),
        "total_budget": money(total_budget),
        "balance": money(balance),
        "net_cash_flow": money(net_cash_flow),
        "wallet_balance": money(get_wallet_balance(user=user)),
        "category_breakdown": [
            {
                "category_id": row["category_id"],
                "category_name": row["category__name"] or "Uncategorized",
                "total": money(row["total"]),
                "count": row["count"],
            }
            for row in category_rows
        ],
        "payment_method_breakdown": [
            {
                "payment_method": row["payment_method"],
                "total": money(row["total"]),
                "count": row["count"],
            }
            for row in payment_method_rows
        ],
        "income_category_breakdown": [
            {
                "category_id": row["category_id"],
                "category_name": row["category__name"] or "Uncategorized",
                "total": money(row["total"]),
                "count": row["count"],
            }
            for row in income_category_rows
        ],
        "income_payment_method_breakdown": [
            {
                "payment_method": row["payment_method"],
                "total": money(row["total"]),
                "count": row["count"],
            }
            for row in income_payment_method_rows
        ],
        "expense_count": expenses.count(),
        "income_count": income.count(),
        "transaction_count": expenses.count() + income.count(),
    }


def build_expenses_csv(expenses):
    output = StringIO()
    writer = csv.writer(output)
    writer.writerow(["Date", "Type", "Title", "Category", "Payment Method", "Amount", "Note"])

    for expense in expenses:
        writer.writerow(
            [
                expense.expense_date.isoformat(),
                expense.get_transaction_type_display(),
                expense.title,
                expense.category.name if expense.category else "Uncategorized",
                expense.get_payment_method_display(),
                money(expense.amount),
                expense.note,
            ]
        )

    return output.getvalue()


def build_monthly_report_pdf(report_data, expenses):
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=landscape(letter),
        rightMargin=0.45 * inch,
        leftMargin=0.45 * inch,
        topMargin=0.45 * inch,
        bottomMargin=0.55 * inch,
    )
    styles = _pdf_styles()
    generated_at = timezone.localtime(timezone.now()).strftime("%d %b %Y, %I:%M %p")
    balance = Decimal(report_data["balance"])
    balance_label = "Remaining" if balance >= 0 else "Over Budget"

    story = []
    story.append(
        Table(
            [
                [
                    Paragraph("Sora Transaction Report", styles["ReportTitle"]),
                    Paragraph(
                        f"Month: {report_data['month']}<br/>Generated: {generated_at}",
                        styles["ReportMeta"],
                    ),
                ]
            ],
            colWidths=[6.8 * inch, 3.0 * inch],
            style=[
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#111827")),
                ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#111827")),
                ("LEFTPADDING", (0, 0), (-1, -1), 16),
                ("RIGHTPADDING", (0, 0), (-1, -1), 16),
                ("TOPPADDING", (0, 0), (-1, -1), 14),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 14),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ],
        )
    )
    story.append(Spacer(1, 0.22 * inch))

    story.append(
        _table(
            [
                ["Income", "Expense", "Net Cash Flow", "Wallet Balance", "Transactions"],
                [
                    display_money(report_data["total_income"]),
                    display_money(report_data["total_expense"]),
                    display_money(report_data["net_cash_flow"]),
                    display_money(report_data["wallet_balance"]),
                    str(report_data["transaction_count"]),
                ],
            ],
            [1.96 * inch, 1.96 * inch, 1.96 * inch, 1.96 * inch, 1.96 * inch],
            styles,
            kind="summary",
        )
    )
    story.append(Spacer(1, 0.22 * inch))

    story.append(Paragraph("Category Breakdown", styles["SectionTitle"]))
    category_rows = [["Category", "Amount", "Count"]]
    category_rows.extend(
        [
            row["category_name"],
            display_money(row["total"]),
            str(row["count"]),
        ]
        for row in report_data["category_breakdown"]
    )
    if len(category_rows) == 1:
        category_rows.append(["No expenses found", display_money("0.00"), "0"])
    story.append(
        _table(
            category_rows,
            [5.8 * inch, 2.0 * inch, 2.0 * inch],
            styles,
            numeric_columns={1, 2},
        )
    )
    story.append(Spacer(1, 0.2 * inch))

    story.append(Paragraph("Payment Method Breakdown", styles["SectionTitle"]))
    payment_rows = [["Payment Method", "Amount", "Count"]]
    payment_rows.extend(
        [
            str(row["payment_method"]).title(),
            display_money(row["total"]),
            str(row["count"]),
        ]
        for row in report_data["payment_method_breakdown"]
    )
    if len(payment_rows) == 1:
        payment_rows.append(["No expenses found", display_money("0.00"), "0"])
    story.append(
        _table(
            payment_rows,
            [5.8 * inch, 2.0 * inch, 2.0 * inch],
            styles,
            numeric_columns={1, 2},
        )
    )
    story.append(Spacer(1, 0.2 * inch))

    story.append(Paragraph("Transaction Table", styles["SectionTitle"]))
    expense_rows = [["Date", "Type", "Title", "Category", "Method", "Amount", "Note"]]
    expense_rows.extend(
        [
            expense.expense_date.isoformat(),
            expense.get_transaction_type_display(),
            expense.title,
            expense.category.name if expense.category else "Uncategorized",
            expense.get_payment_method_display(),
            display_money(expense.amount),
            expense.note or "",
        ]
        for expense in expenses
    )
    if len(expense_rows) == 1:
        expense_rows.append(["No transactions found", "", "", "", "", display_money("0.00"), ""])
    story.append(
        _table(
            expense_rows,
            [0.8 * inch, 0.7 * inch, 1.45 * inch, 1.25 * inch, 1.0 * inch, 1.05 * inch, 3.55 * inch],
            styles,
            numeric_columns={5},
        )
    )

    doc.build(story, onFirstPage=_draw_footer, onLaterPages=_draw_footer)
    pdf = buffer.getvalue()
    buffer.close()
    return pdf


def _pdf_styles():
    base = getSampleStyleSheet()
    base.add(
        ParagraphStyle(
            name="ReportTitle",
            parent=base["Title"],
            alignment=0,
            fontName="Helvetica-Bold",
            fontSize=22,
            leading=26,
            textColor=colors.white,
        )
    )
    base.add(
        ParagraphStyle(
            name="ReportMeta",
            parent=base["Normal"],
            alignment=TA_RIGHT,
            fontSize=9,
            leading=13,
            textColor=colors.HexColor("#d1d5db"),
        )
    )
    base.add(
        ParagraphStyle(
            name="SectionTitle",
            parent=base["Heading2"],
            fontName="Helvetica-Bold",
            fontSize=12,
            leading=16,
            spaceAfter=6,
            textColor=colors.HexColor("#111827"),
        )
    )
    base.add(
        ParagraphStyle(
            name="TableHeader",
            parent=base["Normal"],
            alignment=TA_CENTER,
            fontName="Helvetica-Bold",
            fontSize=8,
            leading=10,
            textColor=colors.white,
        )
    )
    base.add(
        ParagraphStyle(
            name="TableCell",
            parent=base["Normal"],
            fontSize=8,
            leading=10,
            textColor=colors.HexColor("#111827"),
        )
    )
    base.add(
        ParagraphStyle(
            name="TableCellRight",
            parent=base["TableCell"],
            alignment=TA_RIGHT,
        )
    )
    base.add(
        ParagraphStyle(
            name="SummaryHeader",
            parent=base["Normal"],
            alignment=TA_CENTER,
            fontName="Helvetica-Bold",
            fontSize=8,
            leading=10,
            textColor=colors.HexColor("#4b5563"),
        )
    )
    base.add(
        ParagraphStyle(
            name="SummaryValue",
            parent=base["Normal"],
            alignment=TA_CENTER,
            fontName="Helvetica-Bold",
            fontSize=13,
            leading=16,
            textColor=colors.HexColor("#111827"),
        )
    )
    return base


def _table(rows, col_widths, styles, numeric_columns=None, kind="standard"):
    numeric_columns = numeric_columns or set()
    paragraph_rows = []

    for row_index, row in enumerate(rows):
        paragraph_row = []
        for col_index, value in enumerate(row):
            if kind == "summary":
                style_name = "SummaryHeader" if row_index == 0 else "SummaryValue"
            elif row_index == 0:
                style_name = "TableHeader"
            elif col_index in numeric_columns:
                style_name = "TableCellRight"
            else:
                style_name = "TableCell"
            paragraph_row.append(Paragraph(escape(str(value)), styles[style_name]))
        paragraph_rows.append(paragraph_row)

    table = Table(paragraph_rows, colWidths=col_widths, repeatRows=0 if kind == "summary" else 1)
    table_style = [
        ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#d1d5db")),
        ("INNERGRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#e5e7eb")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 7),
        ("RIGHTPADDING", (0, 0), (-1, -1), 7),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]

    if kind == "summary":
        table_style.extend(
            [
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f9fafb")),
                ("LINEBELOW", (0, 0), (-1, 0), 0.4, colors.HexColor("#e5e7eb")),
            ]
        )
    else:
        table_style.extend(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1f2937")),
                (
                    "ROWBACKGROUNDS",
                    (0, 1),
                    (-1, -1),
                    [colors.white, colors.HexColor("#f9fafb")],
                ),
            ]
        )

    table.setStyle(TableStyle(table_style))
    return table


def _draw_footer(canvas, doc):
    canvas.saveState()
    canvas.setStrokeColor(colors.HexColor("#e5e7eb"))
    canvas.setLineWidth(0.5)
    canvas.line(doc.leftMargin, 0.42 * inch, doc.pagesize[0] - doc.rightMargin, 0.42 * inch)
    canvas.setFillColor(colors.HexColor("#6b7280"))
    canvas.setFont("Helvetica", 8)
    canvas.drawString(doc.leftMargin, 0.25 * inch, "Sora Expense")
    canvas.drawRightString(
        doc.pagesize[0] - doc.rightMargin,
        0.25 * inch,
        f"Page {doc.page}",
    )
    canvas.restoreState()
