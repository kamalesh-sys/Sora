# Sora Expense

Sora Expense is a personal house expense tracker with a Django REST backend, an Expo React Native Android app, and a small static APK download page.

The app is built for quickly recording daily expenses, managing categories and bills, checking monthly summaries, exporting reports, and sharing a demo APK with clients.

## What Is Included

- Django REST API with PostgreSQL support through `DATABASE_URL`
- Email OTP authentication for signup/login
- Expense, category, budget, bill, people, household, settlement, and report flows
- CSV and PDF exports for monthly reports
- Monthly email report management commands
- Expo React Native Android app with Material-style UI
- Android home-screen widget for recent expense and quick add
- Static APK download page in `docs/`

## Tech Stack

- Backend: Django, Django REST Framework, PostgreSQL, ReportLab
- Mobile: Expo, React Native, TypeScript, React Native Paper, Axios
- Hosting: Render for backend, GitHub Pages or Render Static Site for APK download page
- Database: Supabase PostgreSQL or any hosted PostgreSQL compatible with Django

## Project Structure

```text
backend/   Django project and expenses API
mobile/    Expo React Native app and Android native project
docs/      Static Sora Expense APK download page
COMMANDS.md  Common local, build, deploy, and log commands
```

## Backend

Run locally:

```powershell
cd D:\HouseExpenseTracker\backend
.\.venv\Scripts\python.exe manage.py migrate
.\.venv\Scripts\python.exe manage.py runserver 0.0.0.0:8000
```

Required environment variables:

```env
SECRET_KEY=
DEBUG=False
DATABASE_URL=
ALLOWED_HOSTS=
CSRF_TRUSTED_ORIGINS=

EMAIL_HOST=
EMAIL_PORT=
EMAIL_HOST_USER=
EMAIL_HOST_PASSWORD=
EMAIL_USE_TLS=True
DEFAULT_FROM_EMAIL=
```

The backend talks directly to PostgreSQL. It does not use the Supabase REST API.

## Mobile App

Install dependencies:

```powershell
cd D:\HouseExpenseTracker\mobile
npm install
```

Run with Expo:

```powershell
npx expo start
```

The API base URL is configured here:

```text
mobile/src/config/api.ts
```

For a physical phone, use a deployed backend URL or your laptop LAN IP.

## Android APK Build

Build release APK:

```powershell
cd D:\HouseExpenseTracker\mobile\android
$env:JAVA_HOME="C:\Program Files\Android\Android Studio\jbr"
$env:ANDROID_HOME="$env:LOCALAPPDATA\Android\Sdk"
$env:Path="$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:Path"

.\gradlew --stop
.\gradlew clean assembleRelease
```

APK output:

```text
mobile/android/app/build/outputs/apk/release/app-release.apk
```

Install on a connected Android device:

```powershell
adb install -r app\build\outputs\apk\release\app-release.apk
```

## Download Page

The static APK download page is in:

```text
docs/index.html
```

Open locally:

```powershell
Start-Process D:\HouseExpenseTracker\docs\index.html
```

Recommended GitHub Pages setup:

- Source: Deploy from a branch
- Branch: `main`
- Folder: `/docs`

After building a new APK, refresh the download page APK:

```powershell
Copy-Item -LiteralPath D:\HouseExpenseTracker\mobile\android\app\build\outputs\apk\release\app-release.apk -Destination D:\HouseExpenseTracker\docs\downloads\sora-expense-latest.apk -Force
Get-FileHash D:\HouseExpenseTracker\docs\downloads\sora-expense-latest.apk -Algorithm SHA256
```

If the APK changes, update the file size, date, and SHA-256 shown in `docs/index.html`.

## Useful Commands

Most repeated commands are documented in:

```text
COMMANDS.md
```

That file includes backend startup, migrations, Android builds, APK install commands, live ADB logs, crash logs, and static download page commands.

## Production Notes

- Keep secrets only in environment variables. Do not commit `.env` files.
- Use HTTPS backend URLs in production mobile builds.
- Use Render or another server platform for the Django backend.
- Use GitHub Pages or Render Static Site for the static APK download page.
- For public production distribution, prefer GitHub Releases or object storage for APK files instead of committing every APK into Git history.
- This app is a personal finance utility, not financial, legal, tax, or investment advice.

