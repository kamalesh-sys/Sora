import uuid

import requests
from django.conf import settings


class TurnstileConfigurationError(Exception):
    pass


def get_client_ip(request):
    forwarded_for = request.META.get("HTTP_X_FORWARDED_FOR", "")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")


def verify_turnstile_token(token, remote_ip=None):
    if not getattr(settings, "TURNSTILE_REQUIRED", True):
        return True, []

    if not token:
        return False, ["missing-input-response"]

    secret = getattr(settings, "TURNSTILE_SECRET_KEY", "")
    if not secret:
        raise TurnstileConfigurationError("TURNSTILE_SECRET_KEY is not configured.")

    response = requests.post(
        getattr(
            settings,
            "TURNSTILE_VERIFY_URL",
            "https://challenges.cloudflare.com/turnstile/v0/siteverify",
        ),
        json={
            "secret": secret,
            "response": token,
            "remoteip": remote_ip,
            "idempotency_key": str(uuid.uuid4()),
        },
        timeout=getattr(settings, "TURNSTILE_TIMEOUT", 10),
    )
    response.raise_for_status()
    payload = response.json()
    return bool(payload.get("success")), payload.get("error-codes", [])
