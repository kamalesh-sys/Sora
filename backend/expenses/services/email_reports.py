from django.conf import settings
from django.core.mail import EmailMessage

from .reports import build_monthly_report_pdf, get_monthly_expenses, get_monthly_report_data


def build_monthly_report_email(start, end, recipient_email):
    expenses = list(get_monthly_expenses(start, end))
    report_data = get_monthly_report_data(start, end)
    pdf_content = build_monthly_report_pdf(report_data, expenses)
    month_label = start.strftime("%Y-%m")
    filename = f"sora-expense-report-{month_label}.pdf"

    email = EmailMessage(
        subject=f"Sora Expense Report - {month_label}",
        body=(
            f"Attached is your house expense report for {month_label}.\n\n"
            f"Total Expense: {report_data['total_expense']}\n"
            f"Total Budget: {report_data['total_budget']}\n"
            f"Balance: {report_data['balance']}\n"
            f"Expense Count: {report_data['expense_count']}"
        ),
        from_email=settings.DEFAULT_FROM_EMAIL,
        to=[recipient_email],
    )
    email.attach(filename, pdf_content, "application/pdf")
    return email, filename


def send_monthly_report_email(start, end, recipient_email):
    email, filename = build_monthly_report_email(start, end, recipient_email)
    sent_count = email.send(fail_silently=False)
    return sent_count, filename
