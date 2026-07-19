import csv
from calendar import monthrange
from datetime import date
from decimal import Decimal
from io import BytesIO, StringIO
from xml.sax.saxutils import escape

from django.utils import timezone
from django.db.models import Count, Q, Sum
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm, mm
from reportlab.platypus import (
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
    HRFlowable,
)

from expenses.models import Expense, MonthlyBudget


# ─── palette (monochrome — only values differ) ────────────────────────────────
INK        = colors.HexColor("#0D0D0D")
INK_MUTED  = colors.HexColor("#6B6B6B")
INK_FAINT  = colors.HexColor("#AAAAAA")
RULE       = colors.HexColor("#D8D8D8")
ROW_ALT    = colors.HexColor("#F8F8F8")
PAGE_W, PAGE_H = A4
MARGIN = 1.6 * cm


# ─── money helpers ────────────────────────────────────────────────────────────

def money(value):
    amount = value or Decimal("0.00")
    return str(amount.quantize(Decimal("0.01")))


def fmt(value):
    """Format as ₹1,23,456.00 (Indian grouping)."""
    d = Decimal(str(value or "0.00"))
    is_neg = d < 0
    d = abs(d)
    integer_part, _, frac_part = f"{d:.2f}".partition(".")
    # Indian grouping: last 3 then groups of 2
    s = integer_part
    if len(s) > 3:
        s = s[:-3] + "," + s[-3:]
        i = len(s) - 7
        while i > 0:
            s = s[:i] + "," + s[i:]
            i -= 2
    result = f"₹{s}.{frac_part}"
    return f"−{result}" if is_neg else result


# ─── date helpers ─────────────────────────────────────────────────────────────

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


# ─── queryset helpers ─────────────────────────────────────────────────────────

def get_monthly_transactions(start, end, user=None):
    qs = Expense.objects.select_related("category").filter(
        expense_date__range=(start, end)
    )
    if user is not None:
        qs = qs.filter(user=user, household__isnull=True)
    return qs


def get_monthly_expenses(start, end, user=None):
    return get_monthly_transactions(start, end, user=user).filter(
        transaction_type=Expense.TransactionType.EXPENSE
    )


def get_monthly_income(start, end, user=None):
    return get_monthly_transactions(start, end, user=user).filter(
        transaction_type=Expense.TransactionType.INCOME
    )


def get_wallet_balance(user=None):
    income_qs = Expense.objects.filter(transaction_type=Expense.TransactionType.INCOME)
    expense_qs = Expense.objects.filter(transaction_type=Expense.TransactionType.EXPENSE)
    if user is not None:
        income_qs = income_qs.filter(user=user)
        expense_qs = expense_qs.filter(
            Q(paid_by_user=user) | Q(user=user, paid_by_user__isnull=True)
        )
    total_income  = income_qs.aggregate(t=Sum("amount"))["t"] or Decimal("0.00")
    total_expense = expense_qs.aggregate(t=Sum("amount"))["t"] or Decimal("0.00")
    return total_income - total_expense


def get_monthly_report_data(start, end, user=None):
    expenses = get_monthly_expenses(start, end, user=user)
    income   = get_monthly_income(start, end, user=user)
    budgets  = MonthlyBudget.objects.filter(month=start)
    if user is not None:
        budgets = budgets.filter(user=user)

    total_expense = expenses.aggregate(t=Sum("amount"))["t"] or Decimal("0.00")
    total_income  = income.aggregate(t=Sum("amount"))["t"]   or Decimal("0.00")
    total_budget  = budgets.aggregate(t=Sum("amount"))["t"]  or Decimal("0.00")
    balance       = total_budget - total_expense
    net_cash_flow = total_income - total_expense

    def _cat_rows(qs):
        return list(
            qs.values("category_id", "category__name")
            .annotate(total=Sum("amount"), count=Count("id"))
            .order_by("-total", "category__name")
        )

    def _pm_rows(qs):
        return list(
            qs.values("payment_method")
            .annotate(total=Sum("amount"), count=Count("id"))
            .order_by("-total", "payment_method")
        )

    return {
        "month":              start.strftime("%Y-%m"),
        "month_label":        start.strftime("%B %Y"),
        "total_expense":      money(total_expense),
        "total_income":       money(total_income),
        "total_budget":       money(total_budget),
        "balance":            money(balance),
        "net_cash_flow":      money(net_cash_flow),
        "wallet_balance":     money(get_wallet_balance(user=user)),
        "expense_count":      expenses.count(),
        "income_count":       income.count(),
        "transaction_count":  expenses.count() + income.count(),
        "category_breakdown": [
            {"category_name": r["category__name"] or "Uncategorized",
             "total": money(r["total"]), "count": r["count"]}
            for r in _cat_rows(expenses)
        ],
        "payment_method_breakdown": [
            {"payment_method": r["payment_method"],
             "total": money(r["total"]), "count": r["count"]}
            for r in _pm_rows(expenses)
        ],
        "income_category_breakdown": [
            {"category_name": r["category__name"] or "Uncategorized",
             "total": money(r["total"]), "count": r["count"]}
            for r in _cat_rows(income)
        ],
        "income_payment_method_breakdown": [
            {"payment_method": r["payment_method"],
             "total": money(r["total"]), "count": r["count"]}
            for r in _pm_rows(income)
        ],
    }


# ─── CSV export (unchanged) ───────────────────────────────────────────────────

def build_expenses_csv(expenses):
    output = StringIO()
    writer = csv.writer(output)
    writer.writerow(["Date", "Type", "Title", "Category", "Payment Method", "Amount", "Note"])
    for e in expenses:
        writer.writerow([
            e.expense_date.isoformat(),
            e.get_transaction_type_display(),
            e.title,
            e.category.name if e.category else "Uncategorized",
            e.get_payment_method_display(),
            money(e.amount),
            e.note,
        ])
    return output.getvalue()


# ─── PDF builder ──────────────────────────────────────────────────────────────

def build_monthly_report_pdf(report_data, expenses):
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=MARGIN,
        leftMargin=MARGIN,
        topMargin=MARGIN,
        bottomMargin=1.6 * cm,
        title=f"Expense Report – {report_data.get('month_label', report_data['month'])}",
    )

    S = _styles()
    W = PAGE_W - 2 * MARGIN   # usable width
    story = []

    # ── Header ────────────────────────────────────────────────────────────────
    generated_at = timezone.localtime(timezone.now()).strftime("%d %b %Y, %I:%M %p")
    month_label  = report_data.get("month_label", report_data["month"])

    story.append(
        Table(
            [[
                Paragraph("Sora Expense", S["brand"]),
                Paragraph(
                    f"Monthly Report<br/>"
                    f"<font size='9' color='#6B6B6B'>{month_label}</font>",
                    S["header_right"],
                ),
            ]],
            colWidths=[W * 0.5, W * 0.5],
            style=[
                ("VALIGN",       (0, 0), (-1, -1), "BOTTOM"),
                ("TOPPADDING",   (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING",(0, 0), (-1, -1), 10),
                ("LEFTPADDING",  (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
            ],
        )
    )
    story.append(HRFlowable(width=W, thickness=1.2, color=INK, spaceAfter=14))

    # ── Summary block ─────────────────────────────────────────────────────────
    net = Decimal(report_data["net_cash_flow"])

    summary_pairs = [
        ("Total Income",    fmt(report_data["total_income"])),
        ("Total Expenses",  fmt(report_data["total_expense"])),
        ("Net Cash Flow",   fmt(report_data["net_cash_flow"])),
        ("Wallet Balance",  fmt(report_data["wallet_balance"])),
        ("Transactions",    str(report_data["transaction_count"])),
    ]

    summary_rows = [
        [
            Paragraph(label, S["sum_label"]),
            Paragraph(value, S["sum_value"]),
        ]
        for label, value in summary_pairs
    ]

    story.append(
        Table(
            summary_rows,
            colWidths=[W * 0.55, W * 0.45],
            style=[
                ("VALIGN",       (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING",  (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ("TOPPADDING",   (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING",(0, 0), (-1, -1), 5),
                ("LINEBELOW",    (0, 0), (-1, -2), 0.4, RULE),
            ],
        )
    )
    story.append(Spacer(1, 18))

    # ── Category breakdown ────────────────────────────────────────────────────
    cat_data = report_data["category_breakdown"]
    story.append(Paragraph("Expenses by Category", S["section"]))
    story.append(HRFlowable(width=W, thickness=0.5, color=RULE, spaceAfter=6))

    if cat_data:
        total_exp = Decimal(report_data["total_expense"]) or Decimal("1")
        cat_rows = [[
            Paragraph("Category", S["th"]),
            Paragraph("Transactions", S["th_r"]),
            Paragraph("Share", S["th_r"]),
            Paragraph("Amount", S["th_r"]),
        ]]
        for r in cat_data:
            pct = Decimal(r["total"]) / total_exp * 100
            cat_rows.append([
                Paragraph(escape(r["category_name"]), S["td"]),
                Paragraph(str(r["count"]), S["td_r"]),
                Paragraph(f"{pct:.1f}%", S["td_r"]),
                Paragraph(fmt(r["total"]), S["td_r"]),
            ])
        story.append(_plain_table(cat_rows, [W * 0.45, W * 0.18, W * 0.14, W * 0.23]))
    else:
        story.append(Paragraph("No expense transactions this month.", S["empty"]))

    story.append(Spacer(1, 18))

    # ── Payment method breakdown ──────────────────────────────────────────────
    pm_data = report_data["payment_method_breakdown"]
    story.append(Paragraph("Expenses by Payment Method", S["section"]))
    story.append(HRFlowable(width=W, thickness=0.5, color=RULE, spaceAfter=6))

    if pm_data:
        total_exp = Decimal(report_data["total_expense"]) or Decimal("1")
        pm_rows = [[
            Paragraph("Method", S["th"]),
            Paragraph("Transactions", S["th_r"]),
            Paragraph("Share", S["th_r"]),
            Paragraph("Amount", S["th_r"]),
        ]]
        for r in pm_data:
            pct = Decimal(r["total"]) / total_exp * 100
            pm_rows.append([
                Paragraph(str(r["payment_method"]).upper(), S["td"]),
                Paragraph(str(r["count"]), S["td_r"]),
                Paragraph(f"{pct:.1f}%", S["td_r"]),
                Paragraph(fmt(r["total"]), S["td_r"]),
            ])
        story.append(_plain_table(pm_rows, [W * 0.45, W * 0.18, W * 0.14, W * 0.23]))
    else:
        story.append(Paragraph("No expense transactions this month.", S["empty"]))

    story.append(Spacer(1, 18))

    # ── Income breakdown (only when present) ──────────────────────────────────
    income_cat = report_data["income_category_breakdown"]
    if income_cat:
        story.append(Paragraph("Income by Category", S["section"]))
        story.append(HRFlowable(width=W, thickness=0.5, color=RULE, spaceAfter=6))
        total_inc = Decimal(report_data["total_income"]) or Decimal("1")
        inc_rows = [[
            Paragraph("Category", S["th"]),
            Paragraph("Transactions", S["th_r"]),
            Paragraph("Share", S["th_r"]),
            Paragraph("Amount", S["th_r"]),
        ]]
        for r in income_cat:
            pct = Decimal(r["total"]) / total_inc * 100
            inc_rows.append([
                Paragraph(escape(r["category_name"]), S["td"]),
                Paragraph(str(r["count"]), S["td_r"]),
                Paragraph(f"{pct:.1f}%", S["td_r"]),
                Paragraph(fmt(r["total"]), S["td_r"]),
            ])
        story.append(_plain_table(inc_rows, [W * 0.45, W * 0.18, W * 0.14, W * 0.23]))
        story.append(Spacer(1, 18))

    # ── Transaction ledger ────────────────────────────────────────────────────
    story.append(Paragraph("Transaction Ledger", S["section"]))
    story.append(HRFlowable(width=W, thickness=0.5, color=RULE, spaceAfter=6))

    expense_list = list(expenses)
    if expense_list:
        tx_rows = [[
            Paragraph("Date",     S["th"]),
            Paragraph("Title",    S["th"]),
            Paragraph("Category", S["th"]),
            Paragraph("Method",   S["th"]),
            Paragraph("Type",     S["th_r"]),
            Paragraph("Amount",   S["th_r"]),
        ]]
        for e in expense_list:
            is_income = e.transaction_type == Expense.TransactionType.INCOME
            prefix    = "+" if is_income else ""
            amt_style = S["td_inc"] if is_income else S["td_r"]
            tx_rows.append([
                Paragraph(e.expense_date.strftime("%d %b"), S["td"]),
                Paragraph(escape(e.title or "—"), S["td"]),
                Paragraph(escape(e.category.name if e.category else "—"), S["td"]),
                Paragraph(escape(e.get_payment_method_display()), S["td"]),
                Paragraph(e.get_transaction_type_display(), S["td_r"]),
                Paragraph(f"{prefix}{fmt(e.amount)}", amt_style),
            ])
        story.append(_plain_table(
            tx_rows,
            [W * 0.11, W * 0.28, W * 0.20, W * 0.13, W * 0.12, W * 0.16],
            alt_rows=True,
        ))
    else:
        story.append(Paragraph("No transactions recorded this month.", S["empty"]))

    doc.build(story, onFirstPage=_footer, onLaterPages=_footer)
    pdf = buffer.getvalue()
    buffer.close()
    return pdf


# ─── table helper ─────────────────────────────────────────────────────────────

def _plain_table(rows, col_widths, alt_rows=False):
    style = [
        ("VALIGN",       (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING",  (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING",   (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING",(0, 0), (-1, -1), 5),
        # Header row — just a bottom rule, no background
        ("LINEBELOW",    (0, 0), (-1, 0), 0.8, INK),
        # Outer box
        ("BOX",          (0, 0), (-1, -1), 0.4, RULE),
    ]
    if alt_rows:
        for i in range(2, len(rows), 2):
            style.append(("BACKGROUND", (0, i), (-1, i), ROW_ALT))
    t = Table(rows, colWidths=col_widths, repeatRows=1)
    t.setStyle(TableStyle(style))
    return t


# ─── styles ───────────────────────────────────────────────────────────────────

def _styles():
    base = getSampleStyleSheet()

    def add(name, **kw):
        base.add(ParagraphStyle(name=name, parent=base["Normal"], **kw))

    add("brand",
        fontName="Helvetica-Bold", fontSize=16, leading=20, textColor=INK)

    add("header_right",
        fontName="Helvetica-Bold", fontSize=11, leading=15,
        textColor=INK, alignment=TA_RIGHT)

    add("sum_label",
        fontSize=9, leading=12, textColor=INK_MUTED)

    add("sum_value",
        fontName="Helvetica-Bold", fontSize=9, leading=12,
        textColor=INK, alignment=TA_RIGHT)

    add("section",
        fontName="Helvetica-Bold", fontSize=9, leading=12,
        textColor=INK, spaceBefore=2, spaceAfter=0)

    add("th",
        fontName="Helvetica-Bold", fontSize=7.5, leading=10,
        textColor=INK)

    add("th_r",
        fontName="Helvetica-Bold", fontSize=7.5, leading=10,
        textColor=INK, alignment=TA_RIGHT)

    add("td",
        fontSize=7.5, leading=10, textColor=INK)

    add("td_r",
        fontSize=7.5, leading=10, textColor=INK, alignment=TA_RIGHT)

    add("td_inc",
        fontSize=7.5, leading=10, textColor=INK, alignment=TA_RIGHT,
        fontName="Helvetica-Bold")

    add("empty",
        fontSize=8, leading=12, textColor=INK_FAINT)

    return base


# ─── footer ───────────────────────────────────────────────────────────────────

def _footer(canvas, doc):
    canvas.saveState()
    y = 1.0 * cm
    canvas.setStrokeColor(RULE)
    canvas.setLineWidth(0.5)
    canvas.line(doc.leftMargin, y, doc.pagesize[0] - doc.rightMargin, y)
    canvas.setFillColor(INK_FAINT)
    canvas.setFont("Helvetica", 7)
    canvas.drawString(doc.leftMargin, y - 5 * mm, "Sora Expense")
    canvas.drawRightString(
        doc.pagesize[0] - doc.rightMargin, y - 5 * mm,
        f"Page {doc.page}",
    )
    canvas.restoreState()
