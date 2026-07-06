from .email_delivery import send_transactional_email
from .reports import build_monthly_report_pdf, get_monthly_expenses, get_monthly_report_data


def build_monthly_report_email(start, end, recipient_email):
    expenses = list(get_monthly_expenses(start, end))
    report_data = get_monthly_report_data(start, end)
    pdf_content = build_monthly_report_pdf(report_data, expenses)
    month_label = start.strftime("%Y-%m")
    filename = f"sora-expense-report-{month_label}.pdf"

    subject = f"Sora Expense Report - {month_label}"
    body = (
        f"Attached is your house expense report for {month_label}.\n\n"
        f"Total Expense: {report_data['total_expense']}\n"
        f"Total Budget: {report_data['total_budget']}\n"
        f"Balance: {report_data['balance']}\n"
        f"Expense Count: {report_data['expense_count']}"
    )
    attachments = [(filename, pdf_content, "application/pdf")]
    return subject, body, recipient_email, attachments, filename


def send_monthly_report_email(start, end, recipient_email):
    subject, body, recipient, attachments, filename = build_monthly_report_email(
        start,
        end,
        recipient_email,
    )
    sent_count = send_transactional_email(
        subject=subject,
        text_body=body,
        to=[recipient],
        attachments=attachments,
    )
    return sent_count, filename
