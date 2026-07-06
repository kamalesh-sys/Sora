from rest_framework.throttling import SimpleRateThrottle


class EmailRateThrottle(SimpleRateThrottle):
    scope = "auth"

    def get_cache_key(self, request, view):
        email = ""
        data = getattr(request, "data", {})
        if isinstance(data, dict):
            email = str(data.get("email", "")).strip().lower()

        ident = email or self.get_ident(request)
        return self.cache_format % {"scope": self.scope, "ident": ident}


class AuthRateThrottle(EmailRateThrottle):
    scope = "auth"


class OTPRateThrottle(EmailRateThrottle):
    scope = "otp"
