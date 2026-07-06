import secrets
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import check_password, make_password
from django.core.mail import EmailMultiAlternatives
from django.template.loader import render_to_string
from django.utils import timezone
from rest_framework import status
from rest_framework.authtoken.models import Token
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from .auth_serializers import (
    LoginSerializer,
    RegisterSerializer,
    SignupOTPRequestSerializer,
    UserSerializer,
)
from .models import SignupOTP
from .services.categories import seed_default_categories
from .throttles import AuthRateThrottle, OTPRateThrottle


User = get_user_model()
OTP_TTL_MINUTES = 10
OTP_RESEND_COOLDOWN_SECONDS = 60
OTP_MAX_ATTEMPTS = 5


def _auth_response(user):
    token, _ = Token.objects.get_or_create(user=user)
    return Response({"token": token.key, "user": UserSerializer(user).data})


def _generate_otp():
    return f"{secrets.randbelow(1_000_000):06d}"


def _send_signup_otp_email(email, otp):
    subject = "Your Sora Expense verification code"
    text_body = (
        f"Your Sora Expense verification code is {otp}. "
        f"It expires in {OTP_TTL_MINUTES} minutes."
    )
    html_body = render_to_string(
        "emails/signup_otp.html",
        {"otp": otp, "ttl_minutes": OTP_TTL_MINUTES},
    )
    message = EmailMultiAlternatives(subject=subject, body=text_body, to=[email])
    message.attach_alternative(html_body, "text/html")
    message.send(fail_silently=False)


@api_view(["POST"])
@permission_classes([AllowAny])
@throttle_classes([OTPRateThrottle])
def request_signup_otp(request):
    serializer = SignupOTPRequestSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    email = serializer.validated_data["email"]
    now = timezone.now()
    response_detail = "If this email can register, a verification code will be sent."

    if (
        User.objects.filter(email=email).exists()
        or User.objects.filter(username=email).exists()
    ):
        return Response({"detail": response_detail})

    latest = SignupOTP.objects.filter(email=email, consumed_at__isnull=True).first()
    if latest and latest.created_at > now - timedelta(seconds=OTP_RESEND_COOLDOWN_SECONDS):
        return Response(
            {"detail": "Please wait before requesting another code."},
            status=status.HTTP_429_TOO_MANY_REQUESTS,
        )

    code = _generate_otp()
    SignupOTP.objects.create(
        email=email,
        code_hash=make_password(code),
        expires_at=now + timedelta(minutes=OTP_TTL_MINUTES),
    )

    try:
        _send_signup_otp_email(email, code)
    except Exception:
        return Response(
            {"detail": "Could not process verification email right now."},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )

    return Response({"detail": response_detail})


@api_view(["POST"])
@permission_classes([AllowAny])
@throttle_classes([AuthRateThrottle])
def register(request):
    serializer = RegisterSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    email = serializer.validated_data["email"]
    otp = serializer.validated_data["otp"]
    now = timezone.now()

    otp_record = SignupOTP.objects.filter(email=email, consumed_at__isnull=True).first()
    if not otp_record:
        return Response({"detail": "Request a verification code first."}, status=400)

    if otp_record.expires_at < now:
        return Response({"detail": "Verification code expired."}, status=400)

    if otp_record.attempts >= OTP_MAX_ATTEMPTS:
        return Response({"detail": "Too many invalid attempts. Request a new code."}, status=400)

    if not check_password(otp, otp_record.code_hash):
        otp_record.attempts += 1
        otp_record.save(update_fields=["attempts"])
        return Response({"detail": "Invalid verification code."}, status=400)

    user = serializer.save()
    seed_default_categories(user)
    otp_record.consumed_at = now
    otp_record.save(update_fields=["consumed_at"])
    SignupOTP.objects.filter(email=email, consumed_at__isnull=True).exclude(
        id=otp_record.id
    ).update(consumed_at=now)
    return _auth_response(user)


@api_view(["POST"])
@permission_classes([AllowAny])
@throttle_classes([AuthRateThrottle])
def login(request):
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
