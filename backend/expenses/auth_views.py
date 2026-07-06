import logging

from django.contrib.auth import get_user_model
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


@api_view(["POST"])
@permission_classes([AllowAny])
@throttle_classes([AuthRateThrottle])
def register(request):
    turnstile_error = _verify_turnstile(request)
    if turnstile_error:
        return turnstile_error

    serializer = RegisterSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    user = serializer.save()
    seed_default_categories(user)
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
