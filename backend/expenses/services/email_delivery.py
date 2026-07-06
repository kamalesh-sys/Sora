import base64

import requests
from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.core.mail.message import EmailAttachment
from django.core.management.base import CommandError


class EmailDeliveryError(Exception):
    pass


def get_email_provider():
    return getattr(settings, "EMAIL_PROVIDER", "smtp").strip().lower()


def validate_email_delivery_settings():
    provider = get_email_provider()
    if provider == "resend":
        if not getattr(settings, "RESEND_API_KEY", ""):
            raise CommandError("RESEND_API_KEY is not configured.")
        if not getattr(settings, "RESEND_FROM_EMAIL", ""):
            raise CommandError("RESEND_FROM_EMAIL is not configured.")
        return

    if not settings.EMAIL_HOST:
        raise CommandError("EMAIL_HOST is not configured.")
    if not settings.DEFAULT_FROM_EMAIL:
        raise CommandError("DEFAULT_FROM_EMAIL is not configured.")


def _normalize_attachment(attachment):
    if isinstance(attachment, EmailAttachment):
        filename, content, _mimetype = attachment
    else:
        filename, content, _mimetype = attachment

    if isinstance(content, str):
        content = content.encode()

    return {
        "filename": filename,
        "content": base64.b64encode(content).decode("ascii"),
    }


def _send_with_resend(subject, text_body, html_body, to, attachments=None):
    headers = {
        "Authorization": f"Bearer {settings.RESEND_API_KEY}",
        "Content-Type": "application/json",
    }
    payload = {
        "from": settings.RESEND_FROM_EMAIL,
        "to": list(to),
        "subject": subject,
        "text": text_body,
    }
    if html_body:
        payload["html"] = html_body
    if attachments:
        payload["attachments"] = [_normalize_attachment(item) for item in attachments]

    response = requests.post(
        "https://api.resend.com/emails",
        headers=headers,
        json=payload,
        timeout=getattr(settings, "EMAIL_TIMEOUT", 15),
    )
    if response.status_code >= 400:
        raise EmailDeliveryError(f"Resend API returned HTTP {response.status_code}: {response.text}")
    return 1


def _send_with_smtp(subject, text_body, html_body, to, attachments=None):
    message = EmailMultiAlternatives(
        subject=subject,
        body=text_body,
        from_email=settings.DEFAULT_FROM_EMAIL,
        to=list(to),
    )
    if html_body:
        message.attach_alternative(html_body, "text/html")
    for attachment in attachments or []:
        filename, content, mimetype = attachment
        message.attach(filename, content, mimetype)
    return message.send(fail_silently=False)


def send_transactional_email(subject, text_body, to, html_body=None, attachments=None):
    provider = get_email_provider()
    if provider == "resend":
        return _send_with_resend(subject, text_body, html_body, to, attachments)
    return _send_with_smtp(subject, text_body, html_body, to, attachments)
