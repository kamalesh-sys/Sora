from dataclasses import dataclass
from datetime import date
from decimal import Decimal, ROUND_HALF_UP

from django.utils import timezone

from ..models import Loan


MONEY_QUANTUM = Decimal("0.01")
DAY_COUNT_DENOMINATOR = Decimal("365")


def money(value):
    return Decimal(value or 0).quantize(MONEY_QUANTUM, rounding=ROUND_HALF_UP)


@dataclass(frozen=True)
class LoanMetrics:
    principal_paid: Decimal
    interest_paid: Decimal
    fees_paid: Decimal
    total_paid: Decimal
    accrued_interest: Decimal
    outstanding_principal: Decimal
    outstanding_interest: Decimal
    total_outstanding: Decimal
    principal_progress_percent: Decimal
    status: str
    days_until_due: int | None


def _ordered_payments(loan):
    return loan.payments.order_by("payment_date", "created_at", "id")


def calculate_loan_metrics(loan, payments=None, as_of=None):
    """Calculate a simple daily-interest balance from the dated repayment ledger.

    The tracker intentionally does not infer variable-rate or lender-specific fees. Those
    values are entered as explicit repayment allocations, which keeps balances auditable.
    """

    as_of = as_of or timezone.localdate()
    payment_rows = list(payments if payments is not None else _ordered_payments(loan))
    payment_rows.sort(key=lambda payment: (payment.payment_date, payment.created_at, payment.id))

    principal = money(loan.principal_amount)
    principal_paid = Decimal("0.00")
    interest_paid = Decimal("0.00")
    fees_paid = Decimal("0.00")
    accrued_interest = Decimal("0.00")
    interest_cursor = loan.interest_start_date or loan.disbursed_date
    rate = Decimal(loan.annual_interest_rate or 0)

    for payment in payment_rows:
        payment_date = max(payment.payment_date, interest_cursor)
        if loan.interest_type == Loan.InterestType.SIMPLE and rate > 0 and payment_date > interest_cursor:
            elapsed_days = Decimal((payment_date - interest_cursor).days)
            accrued_interest += principal * (rate / Decimal("100")) * elapsed_days / DAY_COUNT_DENOMINATOR

        principal_payment = money(payment.principal_amount)
        interest_payment = money(payment.interest_amount)
        fee_payment = money(payment.fee_amount)
        principal = max(Decimal("0.00"), principal - principal_payment)
        principal_paid += principal_payment
        interest_paid += interest_payment
        fees_paid += fee_payment
        interest_cursor = payment_date

    if loan.interest_type == Loan.InterestType.SIMPLE and rate > 0 and as_of > interest_cursor:
        elapsed_days = Decimal((as_of - interest_cursor).days)
        accrued_interest += principal * (rate / Decimal("100")) * elapsed_days / DAY_COUNT_DENOMINATOR

    accrued_interest = money(accrued_interest)
    outstanding_principal = money(principal)
    outstanding_interest = money(max(Decimal("0.00"), accrued_interest - interest_paid))
    total_outstanding = money(outstanding_principal + outstanding_interest)
    total_paid = money(principal_paid + interest_paid + fees_paid)
    progress = (
        money((principal_paid / money(loan.principal_amount)) * Decimal("100"))
        if loan.principal_amount
        else Decimal("0.00")
    )

    if loan.status == Loan.Status.CLOSED or total_outstanding == 0:
        status = "closed"
    elif loan.next_due_date and loan.next_due_date < as_of:
        status = "overdue"
    else:
        status = "active"

    days_until_due = (loan.next_due_date - as_of).days if loan.next_due_date else None
    return LoanMetrics(
        principal_paid=money(principal_paid),
        interest_paid=money(interest_paid),
        fees_paid=money(fees_paid),
        total_paid=total_paid,
        accrued_interest=accrued_interest,
        outstanding_principal=outstanding_principal,
        outstanding_interest=outstanding_interest,
        total_outstanding=total_outstanding,
        principal_progress_percent=min(Decimal("100.00"), progress),
        status=status,
        days_until_due=days_until_due,
    )


def get_loan_metrics(loan, as_of=None):
    return calculate_loan_metrics(loan, as_of=as_of)


def latest_payment_date(loan):
    return loan.payments.order_by("-payment_date", "-created_at", "-id").values_list("payment_date", flat=True).first()


def synchronize_loan_status(loan, closed_on=None):
    metrics = get_loan_metrics(loan, as_of=closed_on or timezone.localdate())
    if metrics.total_outstanding == 0:
        closing_date = closed_on or latest_payment_date(loan) or timezone.localdate()
        if loan.status != Loan.Status.CLOSED or loan.closed_on != closing_date:
            loan.status = Loan.Status.CLOSED
            loan.closed_on = closing_date
            loan.save(update_fields=["status", "closed_on", "updated_at"])
        return loan

    if loan.status != Loan.Status.ACTIVE or loan.closed_on is not None:
        loan.status = Loan.Status.ACTIVE
        loan.closed_on = None
        loan.save(update_fields=["status", "closed_on", "updated_at"])
    return loan
