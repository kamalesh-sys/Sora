# Sora Expense Security Notes

Sora Expense uses Django as the only API. The mobile app must never call Supabase directly.

## Supabase

Run Django migrations after deploy:

```powershell
cd D:\HouseExpenseTracker\backend
.\.venv\Scripts\python.exe manage.py migrate
```

The migration `expenses.0007_enable_rls_on_supabase_public_tables` enables Row Level Security on Django tables in Supabase `public`.
The migration `expenses.0008_add_deny_all_rls_policies` adds explicit deny-all policies for Supabase API roles.

This is intentional:

- Django talks directly to PostgreSQL with `DATABASE_URL`.
- Supabase REST/Data API should not expose Django tables.
- Deny-all RLS policies are created, so Supabase `anon` and `authenticated` API roles cannot read or write these tables.
- Do not enable `FORCE ROW LEVEL SECURITY`; Django still needs to operate as the database owner.

In Supabase Dashboard:

1. Go to `Project Settings -> API`.
2. If you do not use Supabase Data API, remove `public` from exposed schemas where possible.
3. Keep the anon key out of the mobile app unless a future feature explicitly uses Supabase APIs.
4. Re-run Supabase Security Advisor after migrations.

## Render Environment

Use production values:

```env
DEBUG=False
ALLOWED_HOSTS=sora-expense-backend.onrender.com
SECURE_SSL_REDIRECT=True
SESSION_COOKIE_SECURE=True
CSRF_COOKIE_SECURE=True
SECURE_HSTS_SECONDS=31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS=True
SECURE_HSTS_PRELOAD=True
CORS_ALLOW_ALL_ORIGINS=False
CORS_ALLOWED_ORIGINS=
CSRF_TRUSTED_ORIGINS=https://sora-expense-backend.onrender.com
DRF_THROTTLE_ANON=60/min
DRF_THROTTLE_USER=600/min
DRF_THROTTLE_AUTH=10/min
DRF_THROTTLE_OTP=3/min
EMAIL_TIMEOUT=15
EMAIL_PROVIDER=resend
RESEND_API_KEY=
RESEND_FROM_EMAIL=Sora Expense <onboarding@resend.dev>
TURNSTILE_REQUIRED=True
TURNSTILE_SECRET_KEY=
TURNSTILE_TIMEOUT=10
WEB_CONCURRENCY=2
GUNICORN_THREADS=2
GUNICORN_TIMEOUT=60
```

Keep secrets only in Render/Supabase environment variables:

```env
SECRET_KEY=
DATABASE_URL=
EMAIL_HOST=
EMAIL_PORT=
EMAIL_HOST_USER=
EMAIL_HOST_PASSWORD=
EMAIL_USE_TLS=True
DEFAULT_FROM_EMAIL=
RESEND_API_KEY=
TURNSTILE_SECRET_KEY=
```

Generate a new Django secret locally, then paste it into Render `SECRET_KEY`:

```powershell
cd D:\HouseExpenseTracker\backend
.\.venv\Scripts\python.exe -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"
```

Do not commit or screenshot the generated value.

## Operational Rules

- Never commit `.env`, app passwords, database URLs, or API keys.
- Rotate any secret that was pasted into chat, logs, screenshots, or Git.
- Use HTTPS-only backend URLs in release APKs.
- Run `python manage.py check --deploy` before production deploys.
- Keep Django admin available only to trusted accounts with strong passwords.
