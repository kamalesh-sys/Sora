import logging
from html import escape

from django.contrib.auth import get_user_model
from django.conf import settings
from django.db import IntegrityError, transaction
from django.http import HttpResponse
from rest_framework import status
from rest_framework.authtoken.models import Token
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from .auth_serializers import (
    LoginSerializer,
    RegisterSerializer,
    UserSerializer,
)
from .services.categories import seed_default_categories
from .services.turnstile import (
    TurnstileConfigurationError,
    get_client_ip,
    verify_turnstile_token,
)
from .throttles import AuthRateThrottle


User = get_user_model()
logger = logging.getLogger(__name__)


def _auth_response(user):
    token, _ = Token.objects.get_or_create(user=user)
    return Response({"token": token.key, "user": UserSerializer(user).data})


def _verify_turnstile(request):
    token = request.data.get("turnstile_token") or request.data.get("cf-turnstile-response")
    try:
        is_valid, error_codes = verify_turnstile_token(token, get_client_ip(request))
    except TurnstileConfigurationError:
        logger.exception("Turnstile is not configured.")
        return Response(
            {"detail": "Human verification is not configured."},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )
    except Exception:
        logger.exception("Turnstile verification failed.")
        return Response(
            {"detail": "Human verification could not be checked."},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )
    if not is_valid:
        logger.info("Turnstile rejected auth request: %s", error_codes)
        return Response(
            {"detail": "Human verification failed. Try again."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    return None


@api_view(["GET"])
@permission_classes([AllowAny])
def turnstile_challenge(request):
    theme = "dark" if request.query_params.get("theme") == "dark" else "light"
    redirect_uri = request.query_params.get("redirect", "")
    site_key = getattr(settings, "TURNSTILE_SITE_KEY", "")
    if not site_key:
        logger.error("TURNSTILE_SITE_KEY is not configured.")

    html = f"""<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      html,
      body {{
        background: transparent;
        color-scheme: {theme};
        margin: 0;
        min-height: 118px;
        overflow: hidden;
      }}

      body {{
        align-items: center;
        display: flex;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        justify-content: center;
      }}

      #turnstile-container {{
        min-height: 72px;
        min-width: 300px;
      }}

      .message {{
        color: #5b616e;
        font-size: 13px;
        font-weight: 600;
        padding: 16px;
        text-align: center;
      }}
    </style>
  </head>
  <body>
    <div id="turnstile-container" aria-label="Human verification"></div>
    <script>
      const siteKey = "{escape(site_key)}";
      const redirectUri = "{escape(redirect_uri)}";

      function send(payload) {{
        const serialized = JSON.stringify(payload);
        if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {{
          window.ReactNativeWebView.postMessage(serialized);
          return;
        }}

        if (redirectUri && payload.type === "success" && payload.token) {{
          const separator = redirectUri.includes("?") ? "&" : "?";
          window.location.href = redirectUri + separator + "token=" + encodeURIComponent(payload.token);
          return;
        }}

        if (redirectUri && payload.type === "error") {{
          const separator = redirectUri.includes("?") ? "&" : "?";
          window.location.href = redirectUri + separator + "error=" + encodeURIComponent(payload.error || "verification_failed");
        }}
      }}

      function showMessage(text) {{
        const container = document.getElementById("turnstile-container");
        container.className = "message";
        container.textContent = text;
      }}

      window.onloadTurnstile = function() {{
        if (!siteKey) {{
          send({{ type: "error", error: "missing_site_key" }});
          showMessage("Human verification is not configured.");
          return;
        }}

        try {{
          turnstile.render("#turnstile-container", {{
            sitekey: siteKey,
            theme: "{theme}",
            callback: function(token) {{
              send({{ type: "success", token: token }});
            }},
            "expired-callback": function() {{
              send({{ type: "expired" }});
            }},
            "error-callback": function(error) {{
              send({{ type: "error", error: String(error || "unknown") }});
            }}
          }});
          send({{ type: "loaded" }});
        }} catch (error) {{
          send({{ type: "error", error: String(error && error.message ? error.message : error) }});
          showMessage("Human verification could not start.");
        }}
      }};

      window.addEventListener("error", function(event) {{
        send({{ type: "error", error: String(event.message || "script_error") }});
      }});
    </script>
    <script src="https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onloadTurnstile&render=explicit" async defer></script>
  </body>
</html>"""

    response = HttpResponse(html)
    response["Content-Type"] = "text/html; charset=utf-8"
    response["Cache-Control"] = "no-store"
    response["Referrer-Policy"] = "no-referrer"
    response["Content-Security-Policy"] = (
        "default-src 'none'; "
        "script-src 'unsafe-inline' https://challenges.cloudflare.com; "
        "frame-src https://challenges.cloudflare.com; "
        "connect-src https://challenges.cloudflare.com; "
        "style-src 'unsafe-inline';"
    )
    return response


@api_view(["POST"])
@permission_classes([AllowAny])
@throttle_classes([AuthRateThrottle])
def register(request):
    turnstile_error = _verify_turnstile(request)
    if turnstile_error:
        return turnstile_error

    serializer = RegisterSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    try:
        with transaction.atomic():
            user = serializer.save()
            seed_default_categories(user)
    except IntegrityError:
        logger.exception("Account creation failed due to an integrity error.")
        return Response(
            {"detail": "Could not create account. Try a different email."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    except Exception:
        logger.exception("Account setup failed.")
        return Response(
            {"detail": "Could not finish account setup. Try again."},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )
    return _auth_response(user)


@api_view(["POST"])
@permission_classes([AllowAny])
@throttle_classes([AuthRateThrottle])
def login(request):
    turnstile_error = _verify_turnstile(request)
    if turnstile_error:
        return turnstile_error

    serializer = LoginSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    return _auth_response(serializer.validated_data["user"])


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def me(request):
    return Response(UserSerializer(request.user).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def logout(request):
    Token.objects.filter(user=request.user).delete()
    return Response(status=status.HTTP_204_NO_CONTENT)
