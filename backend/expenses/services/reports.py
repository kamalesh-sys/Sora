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
from reportlab.lib.units import cm, inch, mm
from reportlab.platypus import (
    Flowable,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from expenses.models import Expense, MonthlyBudget


# ──────────────────────────────────────────────────────────────────────────────
# Colour palette (Sora brand, light background)
# ──────────────────────────────────────────────────────────────────────────────
C = {
    "ink": colors.HexColor("#0A0B0D"),
    "ink_muted": colors.HexColor("#5B616E"),
    "ink_subtle": colors.HexColor("#8A919E"),
    "bg": colors.HexColor("#FFFFFF"),
    "bg_alt": colors.HexColor("#F7F8F9"),
    "bg_surface": colors.HexColor("#EEF0F3"),
    "border": colors.HexColor("#E2E5EB"),
    "accent": colors.HexColor("#0052FF"),
    "accent_light": colors.HexColor("#EBF1FF"),
    "success": colors.HexColor("#098551"),
    "success_light": colors.HexColor("#EAF8EF"),
    "danger": colors.HexColor("#CF202F"),
    "danger_light": colors.HexColor("#FFF0F1"),
    "warning": colors.HexColor("#CF470E"),
    "warning_light": colors.HexColor("#FFF4ED"),
    "header_dark": colors.HexColor("#0A0B0D"),
}

# Category colour wheel (cycle through for visual bars)
CATEGORY_COLORS = [
    colors.HexColor("#0052FF"),
    colors.HexColor("#098551"),
    colors.HexColor("#CF202F"),
    colors.HexColor("#CF470E"),
    colors.HexColor("#7B5EA7"),
    colors.HexColor("#0891B2"),
    colors.HexColor("#BE185D"),
    colors.HexColor("#B45309"),
    colors.HexColor("#15803D"),
    colors.HexColor("#1D4ED8"),
]

PAGE_W, PAGE_H = A4
MARGIN = 1.5 * cm


# ──────────────────────────────────────────────────────────────────────────────
# Custom flowables
# ──────────────────────────────────────────────────────────────────────────────

class HorizontalBar(Flowable):
    """A horizontal coloured bar representing a proportion."""

    def __init__(self, fraction, fill_color, height=10, width=None):
        super().__init__()
        self._fraction = max(0.0, min(1.0, fraction))
        self._fill = fill_color
        self._h = height
        self._w = width or (PAGE_W - 2 * MARGIN)

    def wrap(self, availW, availH):
        self.width = self._w
        self.height = self._h + 2
        return self.width, self.height

    def draw(self):
        c = self.canv
        # Track (bg)
        c.setFillColor(C["bg_surface"])
        c.roundRect(0, 1, self._w, self._h, self._h / 2, fill=1, stroke=0)
        # Fill
        fill_w = self._fraction * self._w
        if fill_w > 2:
            c.setFillColor(self._fill)
            c.roundRect(0, 1, fill_w, self._h, self._h / 2, fill=1, stroke=0)


class ColorDot(Flowable):
    """A small coloured circle, used in legend rows."""

    def __init__(self, color, size=8):
        super().__init__()
        self._color = color
        self._size = size

    def wrap(self, availW, availH):
        return self._size, self._size

    def draw(self):
        c = self.canv
        c.setFillColor(self._color)
        c.circle(self._size / 2, self._size / 2, self._size / 2, fill=1, stroke=0)


class SectionDivider(Flowable):
    """A thin horizontal rule with optional label."""

    def __init__(self, width=None):
        super().__init__()
        self._w = width or (PAGE_W - 2 * MARGIN)

    def wrap(self, availW, availH):
        return self._w, 1

    def draw(self):
        c = self.canv
        c.setStrokeColor(C["border"])
        c.setLineWidth(0.5)
        c.line(0, 0, self._w, 0)


# ──────────────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────────────

def money(value):
    amount = value or Decimal("0.00")
    return str(amount.quantize(Decimal("0.01")))


def display_money(value):
    return f"₹{money(Decimal(str(value or '0.00')))}"


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
    )
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
    total_income = income.aggregate(total=Sum("amount"))["total"] or Decimal("0.00")
    total_expense = expenses.aggregate(total=Sum("amount"))["total"] or Decimal("0.00")
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
        "month_label": start.strftime("%B %Y"),
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


# ──────────────────────────────────────────────────────────────────────────────
# CSV export (unchanged)
# ──────────────────────────────────────────────────────────────────────────────

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


# ──────────────────────────────────────────────────────────────────────────────
# PDF report
# ──────────────────────────────────────────────────────────────────────────────

def build_monthly_report_pdf(report_data, expenses):
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=MARGIN,
        leftMargin=MARGIN,
        topMargin=MARGIN,
        bottomMargin=1.8 * cm,
        title=f"Sora Expense Report – {report_data.get('month_label', report_data['month'])}",
        author="Sora Expense",
    )

    styles = _pdf_styles()
    story = []

    # ── Hero header ──────────────────────────────────────────────────────────
    generated_at = timezone.localtime(timezone.now()).strftime("%d %b %Y, %I:%M %p")
    month_label = report_data.get("month_label", report_data["month"])

    story.append(
        Table(
            [
                [
                    Paragraph("Sora Expense", styles["BrandName"]),
                    Paragraph(
                        f"<b>Monthly Report</b><br/>{month_label}<br/><font size='7'>{generated_at}</font>",
                        styles["HeroMeta"],
                    ),
                ]
            ],
            colWidths=[9 * cm, PAGE_W - 2 * MARGIN - 9 * cm],
            style=[
                ("BACKGROUND", (0, 0), (-1, -1), C["header_dark"]),
                ("LEFTPADDING", (0, 0), (-1, -1), 14),
                ("RIGHTPADDING", (0, 0), (-1, -1), 14),
                ("TOPPADDING", (0, 0), (-1, -1), 14),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 14),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("ROUNDEDCORNERS", [6, 6, 6, 6]),
            ],
        )
    )
    story.append(Spacer(1, 0.4 * cm))

    # ── KPI summary cards ────────────────────────────────────────────────────
    net = Decimal(report_data["net_cash_flow"])
    net_color = C["success"] if net >= 0 else C["danger"]

    kpi_rows = [
        _kpi_cell("Total Income", display_money(report_data["total_income"]), C["success"], C["success_light"], styles),
        _kpi_cell("Total Expenses", display_money(report_data["total_expense"]), C["danger"], C["danger_light"], styles),
        _kpi_cell("Net Cash Flow", display_money(report_data["net_cash_flow"]), net_color, C["accent_light"] if net >= 0 else C["danger_light"], styles),
        _kpi_cell("Wallet Balance", display_money(report_data["wallet_balance"]), C["accent"], C["accent_light"], styles),
    ]

    story.append(
        Table(
            [kpi_rows],
            colWidths=[(PAGE_W - 2 * MARGIN) / 4] * 4,
            style=[
                ("LEFTPADDING", (0, 0), (-1, -1), 4),
                ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                ("TOPPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ],
        )
    )
    story.append(Spacer(1, 0.35 * cm))

    # Transactions count badge row
    tx_badge_data = [
        [
            Paragraph(
                f"<b>{report_data['transaction_count']}</b> transactions this month &nbsp;·&nbsp; "
                f"<font color='#098551'>{report_data['income_count']} income</font> &nbsp;·&nbsp; "
                f"<font color='#CF202F'>{report_data['expense_count']} expenses</font>",
                styles["BadgeText"],
            )
        ]
    ]
    story.append(
        Table(
            tx_badge_data,
            colWidths=[PAGE_W - 2 * MARGIN],
            style=[
                ("BACKGROUND", (0, 0), (-1, -1), C["bg_alt"]),
                ("LEFTPADDING", (0, 0), (-1, -1), 12),
                ("RIGHTPADDING", (0, 0), (-1, -1), 12),
                ("TOPPADDING", (0, 0), (-1, -1), 7),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
                ("BOX", (0, 0), (-1, -1), 0.5, C["border"]),
                ("ROUNDEDCORNERS", [4, 4, 4, 4]),
            ],
        )
    )
    story.append(Spacer(1, 0.5 * cm))

    # ── Category breakdown (expenses) with horizontal bars ───────────────────
    story.append(Paragraph("Expense Breakdown by Category", styles["SectionTitle"]))
    story.append(SectionDivider(PAGE_W - 2 * MARGIN))
    story.append(Spacer(1, 0.15 * cm))

    cat_data = report_data["category_breakdown"]
    total_exp = Decimal(report_data["total_expense"]) or Decimal("1")

    if cat_data:
        for idx, row in enumerate(cat_data):
            clr = CATEGORY_COLORS[idx % len(CATEGORY_COLORS)]
            fraction = Decimal(row["total"]) / total_exp
            pct = float(fraction) * 100
            story.extend(_category_bar_row(row["category_name"], row["total"], row["count"], pct, fraction, clr, styles, PAGE_W - 2 * MARGIN))
    else:
        story.append(Paragraph("No expense transactions recorded this month.", styles["EmptyNote"]))

    story.append(Spacer(1, 0.5 * cm))

    # ── Payment method breakdown ─────────────────────────────────────────────
    story.append(Paragraph("Expense Breakdown by Payment Method", styles["SectionTitle"]))
    story.append(SectionDivider(PAGE_W - 2 * MARGIN))
    story.append(Spacer(1, 0.15 * cm))

    pm_data = report_data["payment_method_breakdown"]
    pm_colors = {
        "upi": colors.HexColor("#7C3AED"),
        "cash": colors.HexColor("#059669"),
        "card": colors.HexColor("#0052FF"),
        "bank": colors.HexColor("#0891B2"),
        "wallet": colors.HexColor("#D97706"),
        "other": colors.HexColor("#6B7280"),
    }

    if pm_data:
        for row in pm_data:
            method = str(row["payment_method"])
            clr = pm_colors.get(method, C["ink_subtle"])
            fraction = Decimal(row["total"]) / total_exp
            pct = float(fraction) * 100
            story.extend(_category_bar_row(
                method.upper(), row["total"], row["count"], pct, fraction, clr, styles, PAGE_W - 2 * MARGIN
            ))
    else:
        story.append(Paragraph("No expense transactions recorded this month.", styles["EmptyNote"]))

    story.append(Spacer(1, 0.5 * cm))

    # ── Income breakdown (if any) ────────────────────────────────────────────
    income_cat = report_data["income_category_breakdown"]
    if income_cat:
        story.append(Paragraph("Income Breakdown by Category", styles["SectionTitle"]))
        story.append(SectionDivider(PAGE_W - 2 * MARGIN))
        story.append(Spacer(1, 0.15 * cm))
        total_inc = Decimal(report_data["total_income"]) or Decimal("1")
        for idx, row in enumerate(income_cat):
            clr = CATEGORY_COLORS[idx % len(CATEGORY_COLORS)]
            fraction = Decimal(row["total"]) / total_inc
            pct = float(fraction) * 100
            story.extend(_category_bar_row(row["category_name"], row["total"], row["count"], pct, fraction, clr, styles, PAGE_W - 2 * MARGIN))
        story.append(Spacer(1, 0.5 * cm))

    # ── Transaction table ────────────────────────────────────────────────────
    story.append(Paragraph("All Transactions", styles["SectionTitle"]))
    story.append(SectionDivider(PAGE_W - 2 * MARGIN))
    story.append(Spacer(1, 0.15 * cm))

    usable_w = PAGE_W - 2 * MARGIN
    col_widths = [2.0 * cm, 1.8 * cm, 3.8 * cm, 2.6 * cm, 1.8 * cm, 2.2 * cm]
    header = [
        Paragraph("Date", styles["TH"]),
        Paragraph("Type", styles["TH"]),
        Paragraph("Title", styles["TH"]),
        Paragraph("Category", styles["TH"]),
        Paragraph("Method", styles["TH"]),
        Paragraph("Amount", styles["THRH"]),
    ]
    tx_rows = [header]

    expense_list = list(expenses)
    if expense_list:
        for i, exp in enumerate(expense_list):
            is_income = exp.transaction_type == Expense.TransactionType.INCOME
            amount_color = "#098551" if is_income else "#CF202F"
            prefix = "+" if is_income else "−"
            row = [
                Paragraph(exp.expense_date.strftime("%d %b"), styles["TD"]),
                Paragraph(exp.get_transaction_type_display(), styles["TDCenter"]),
                Paragraph(escape(exp.title or ""), styles["TD"]),
                Paragraph(escape(exp.category.name if exp.category else "—"), styles["TD"]),
                Paragraph(escape(exp.get_payment_method_display()), styles["TD"]),
                Paragraph(
                    f'<font color="{amount_color}"><b>{prefix}{display_money(exp.amount)}</b></font>',
                    styles["TDRight"],
                ),
            ]
            tx_rows.append(row)
    else:
        tx_rows.append([Paragraph("No transactions", styles["TD"]), Paragraph("", styles["TD"]),
                         Paragraph("", styles["TD"]), Paragraph("", styles["TD"]),
                         Paragraph("", styles["TD"]), Paragraph("", styles["TD"])])

    tx_table = Table(tx_rows, colWidths=col_widths, repeatRows=1)
    tx_table_style = [
        ("BACKGROUND", (0, 0), (-1, 0), C["header_dark"]),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("BOX", (0, 0), (-1, -1), 0.5, C["border"]),
        ("INNERGRID", (0, 0), (-1, -1), 0.25, C["border"]),
    ]
    # Alternating rows
    for i in range(1, len(tx_rows)):
        bg = C["bg"] if i % 2 == 0 else C["bg_alt"]
        tx_table_style.append(("BACKGROUND", (0, i), (-1, i), bg))

    tx_table.setStyle(TableStyle(tx_table_style))
    story.append(tx_table)

    doc.build(story, onFirstPage=_draw_footer, onLaterPages=_draw_footer)
    pdf = buffer.getvalue()
    buffer.close()
    return pdf


# ──────────────────────────────────────────────────────────────────────────────
# Helper builders
# ──────────────────────────────────────────────────────────────────────────────

def _kpi_cell(label, value, accent, bg, styles):
    """Returns a Table that renders a single KPI card."""
    return Table(
        [
            [Paragraph(label, styles["KPILabel"])],
            [Paragraph(value, styles["KPIValue"])],
        ],
        colWidths=[(PAGE_W - 2 * MARGIN) / 4 - 8],
        style=[
            ("BACKGROUND", (0, 0), (-1, -1), bg),
            ("LEFTPADDING", (0, 0), (-1, -1), 10),
            ("RIGHTPADDING", (0, 0), (-1, -1), 10),
            ("TOPPADDING", (0, 0), (-1, 0), 10),
            ("BOTTOMPADDING", (0, 0), (-1, 0), 2),
            ("TOPPADDING", (0, 1), (-1, 1), 2),
            ("BOTTOMPADDING", (0, 1), (-1, 1), 10),
            ("BOX", (0, 0), (-1, -1), 1.5, accent),
            ("LINEBELOW", (0, 0), (-1, 0), 0.5, bg),
            ("ROUNDEDCORNERS", [6, 6, 6, 6]),
        ],
    )


def _category_bar_row(name, total_str, count, pct, fraction, clr, styles, width):
    """Returns a list of flowables representing one row in the bar chart."""
    usable = width
    bar_w = usable - 6.5 * cm  # space left after label + amount columns

    label_amount_table = Table(
        [
            [
                Paragraph(escape(str(name)), styles["BarLabel"]),
                Paragraph(
                    f"<b>{display_money(total_str)}</b>&nbsp;&nbsp;<font color='#8A919E'>{count} tx &nbsp;{pct:.1f}%</font>",
                    styles["BarMeta"],
                ),
            ]
        ],
        colWidths=[bar_w + 2 * cm, 4.3 * cm],
        style=[
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 0),
            ("TOPPADDING", (0, 0), (-1, -1), 1),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 1),
        ],
    )

    return [
        label_amount_table,
        HorizontalBar(float(fraction), clr, height=8, width=usable),
        Spacer(1, 0.18 * cm),
    ]


# ──────────────────────────────────────────────────────────────────────────────
# Styles
# ──────────────────────────────────────────────────────────────────────────────

def _pdf_styles():
    base = getSampleStyleSheet()

    def add(name, **kwargs):
        base.add(ParagraphStyle(name=name, parent=base["Normal"], **kwargs))

    add("BrandName", fontName="Helvetica-Bold", fontSize=18, leading=22, textColor=colors.white)
    add("HeroMeta", fontSize=9, leading=14, textColor=colors.HexColor("#CBD5E1"), alignment=TA_RIGHT)

    add("KPILabel", fontName="Helvetica-Bold", fontSize=7, leading=10, textColor=C["ink_muted"])
    add("KPIValue", fontName="Helvetica-Bold", fontSize=14, leading=18, textColor=C["ink"])

    add("BadgeText", fontSize=9, leading=12, textColor=C["ink_muted"])

    add("SectionTitle", fontName="Helvetica-Bold", fontSize=11, leading=16,
        textColor=C["ink"], spaceAfter=4)

    add("BarLabel", fontSize=8, leading=11, textColor=C["ink"])
    add("BarMeta", fontSize=8, leading=11, textColor=C["ink"], alignment=TA_RIGHT)

    add("TH", fontName="Helvetica-Bold", fontSize=7.5, leading=10, textColor=colors.white, alignment=TA_CENTER)
    add("THRH", fontName="Helvetica-Bold", fontSize=7.5, leading=10, textColor=colors.white, alignment=TA_RIGHT)
    add("TD", fontSize=7.5, leading=10, textColor=C["ink"])
    add("TDCenter", fontSize=7.5, leading=10, textColor=C["ink"], alignment=TA_CENTER)
    add("TDRight", fontSize=7.5, leading=10, textColor=C["ink"], alignment=TA_RIGHT)

    add("EmptyNote", fontSize=9, leading=13, textColor=C["ink_subtle"])

    return base


# ──────────────────────────────────────────────────────────────────────────────
# Footer
# ──────────────────────────────────────────────────────────────────────────────

def _draw_footer(canvas, doc):
    canvas.saveState()
    canvas.setStrokeColor(C["border"])
    canvas.setLineWidth(0.5)
    canvas.line(doc.leftMargin, 1.2 * cm, doc.pagesize[0] - doc.rightMargin, 1.2 * cm)
    canvas.setFillColor(C["ink_subtle"])
    canvas.setFont("Helvetica", 7.5)
    canvas.drawString(doc.leftMargin, 0.7 * cm, "Sora Expense  ·  Confidential")
    canvas.drawRightString(
        doc.pagesize[0] - doc.rightMargin,
        0.7 * cm,
        f"Page {doc.page}",
    )
    canvas.restoreState()
