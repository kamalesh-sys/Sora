# Sora Expense Commands

Run these commands from PowerShell on Windows.

## Backend

Start the Django backend:

```powershell
cd D:\HouseExpenseTracker\backend
.\.venv\Scripts\python.exe manage.py runserver 0.0.0.0:8000
```

Run migrations:

```powershell
cd D:\HouseExpenseTracker\backend
.\.venv\Scripts\python.exe manage.py makemigrations
.\.venv\Scripts\python.exe manage.py migrate
```

Check backend config:

```powershell
cd D:\HouseExpenseTracker\backend
.\.venv\Scripts\python.exe manage.py check
```

Check production security:

```powershell
cd D:\HouseExpenseTracker\backend
.\.venv\Scripts\python.exe manage.py check --deploy
```

Generate a strong Django `SECRET_KEY` for Render:

```powershell
cd D:\HouseExpenseTracker\backend
.\.venv\Scripts\python.exe -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"
```

Create or refresh demo account:

```powershell
cd D:\HouseExpenseTracker\backend
.\.venv\Scripts\python.exe manage.py seed_demo_account
```

Demo login:

```text
Email: kamalesh.demo@test.com
Password: SoraDemo@2026
```

## Mobile Dev

Install packages:

```powershell
cd D:\HouseExpenseTracker\mobile
npm install
```

Run TypeScript check:

```powershell
cd D:\HouseExpenseTracker\mobile
npm run typecheck
```

Check Expo native dependency compatibility:

```powershell
cd D:\HouseExpenseTracker\mobile
npx expo install --check
npx expo-doctor
```

Run the app with production/minified JavaScript:

```powershell
cd D:\HouseExpenseTracker\mobile
npx expo start --no-dev --minify
```

Start Expo:

```powershell
cd D:\HouseExpenseTracker\mobile
npx expo start
```

Run directly on USB-connected Android phone:

```powershell
cd D:\HouseExpenseTracker\mobile
npx expo run:android
```

Backend API URL is here:

```text
D:\HouseExpenseTracker\mobile\src\config\api.ts
```

For phone testing, use your laptop Wi-Fi IP:

```ts
export const API_BASE_URL = "http://YOUR_LAPTOP_IP:8000/api";
```

## Android Setup

Use Android Studio's bundled JDK for Android builds. Do not use Java 26 for this project.

Set Java and Android SDK paths for current terminal:

```powershell
$env:JAVA_HOME="C:\Program Files\Android\Android Studio\jbr"
$env:ANDROID_HOME="$env:LOCALAPPDATA\Android\Sdk"
$env:Path="$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:Path"
```

Verify Java version:

```powershell
java -version
```

Expected result should be Java 21, similar to:

```text
openjdk version "21.0.10"
```

Set Android SDK path for current terminal:

```powershell
$env:ANDROID_HOME="$env:LOCALAPPDATA\Android\Sdk"
$env:Path="$env:ANDROID_HOME\platform-tools;$env:Path"
```

Check connected devices:

```powershell
adb devices
```

## Build APK

Debug APK:

```powershell
cd D:\HouseExpenseTracker\mobile\android
$env:JAVA_HOME="C:\Program Files\Android\Android Studio\jbr"
$env:ANDROID_HOME="$env:LOCALAPPDATA\Android\Sdk"
$env:Path="$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:Path"
.\gradlew --stop
.\gradlew clean
.\gradlew assembleDebug
```

Debug APK output:

```text
D:\HouseExpenseTracker\mobile\android\app\build\outputs\apk\debug\app-debug.apk
```

Release APK:

```powershell
cd D:\HouseExpenseTracker\mobile\android
$env:JAVA_HOME="C:\Program Files\Android\Android Studio\jbr"
$env:ANDROID_HOME="$env:LOCALAPPDATA\Android\Sdk"
$env:Path="$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:Path"
.\gradlew --stop
.\gradlew clean
.\gradlew assembleRelease
```

Release APK output:

```text
D:\HouseExpenseTracker\mobile\android\app\build\outputs\apk\release\app-release.apk
```

The release APK is configured as a universal APK for phones and emulators:

```text
armeabi-v7a, arm64-v8a, x86, x86_64
```

Install release APK on connected phone:

```powershell
cd D:\HouseExpenseTracker\mobile\android
$env:JAVA_HOME="C:\Program Files\Android\Android Studio\jbr"
$env:ANDROID_HOME="$env:LOCALAPPDATA\Android\Sdk"
$env:Path="$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:Path"
adb devices
adb install -r app\build\outputs\apk\release\app-release.apk
```

## Clean Native Build Files

Use this before a fresh Android build:

```powershell
cd D:\HouseExpenseTracker\mobile\android
$env:JAVA_HOME="C:\Program Files\Android\Android Studio\jbr"
$env:ANDROID_HOME="$env:LOCALAPPDATA\Android\Sdk"
$env:Path="$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:Path"
.\gradlew --stop
.\gradlew clean
Remove-Item -Recurse -Force .\app\build -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force .\build -ErrorAction SilentlyContinue
```

## Live Android Logs

Show filtered live logs:

```powershell
cd D:\HouseExpenseTracker\mobile\android
$env:JAVA_HOME="C:\Program Files\Android\Android Studio\jbr"
$env:ANDROID_HOME="$env:LOCALAPPDATA\Android\Sdk"
$env:Path="$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:Path"

adb logcat -v time | Select-String -Pattern "FATAL EXCEPTION|AndroidRuntime|ReactNativeJS|ReactNative|Expo|com.soraexpense|Exception|Error"
```

Save live logs to a text file:

```powershell
cd D:\HouseExpenseTracker\mobile\android
$env:JAVA_HOME="C:\Program Files\Android\Android Studio\jbr"
$env:ANDROID_HOME="$env:LOCALAPPDATA\Android\Sdk"
$env:Path="$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:Path"

$logFile="D:\HouseExpenseTracker\mobile\android\sora-crash-log.txt"

adb logcat -c
adb shell am force-stop com.soraexpense.app

adb logcat -v time |
  Tee-Object -FilePath $logFile |
  Select-String -Pattern "FATAL EXCEPTION|AndroidRuntime|ReactNativeJS|ReactNative|Expo|com.soraexpense|Exception|Error"
```

Crash log file:

```text
D:\HouseExpenseTracker\mobile\android\sora-crash-log.txt
```

## Launch App From ADB

```powershell
$env:ANDROID_HOME="$env:LOCALAPPDATA\Android\Sdk"
$env:Path="$env:ANDROID_HOME\platform-tools;$env:Path"
adb shell monkey -p com.soraexpense.app 1
```

Force stop app:

```powershell
$env:ANDROID_HOME="$env:LOCALAPPDATA\Android\Sdk"
$env:Path="$env:ANDROID_HOME\platform-tools;$env:Path"
adb shell am force-stop com.soraexpense.app
```

Uninstall app:

```powershell
$env:ANDROID_HOME="$env:LOCALAPPDATA\Android\Sdk"
$env:Path="$env:ANDROID_HOME\platform-tools;$env:Path"
adb uninstall com.soraexpense.app
```

## Supabase / Hosted Backend

After deploying the Django backend, update:

```text
D:\HouseExpenseTracker\mobile\src\config\api.ts
```

Example:

```ts
export const API_BASE_URL = "https://your-backend-domain.com/api";
```

Then rebuild the APK:

```powershell
cd D:\HouseExpenseTracker\mobile\android
$env:JAVA_HOME="C:\Program Files\Android\Android Studio\jbr"
$env:ANDROID_HOME="$env:LOCALAPPDATA\Android\Sdk"
$env:Path="$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:Path"
.\gradlew --stop
.\gradlew clean
.\gradlew assembleRelease
adb devices
adb install -r app\build\outputs\apk\release\app-release.apk
```

Run Supabase RLS hardening migration:

```powershell
cd D:\HouseExpenseTracker\backend
.\.venv\Scripts\python.exe manage.py migrate
```

Render production environment essentials:

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
CSRF_TRUSTED_ORIGINS=https://sora-expense-backend.onrender.com
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

Cloudflare Turnstile mobile build site key:

```powershell
cd D:\HouseExpenseTracker\mobile
$env:EXPO_PUBLIC_TURNSTILE_SITE_KEY="your_turnstile_site_key"
```

More detail:

```text
D:\HouseExpenseTracker\SECURITY.md
```

## Static APK Download Page

Open the local download page:

```powershell
Start-Process D:\HouseExpenseTracker\docs\index.html
```

Refresh the APK used by the download page after a new release build:

```powershell
Copy-Item -LiteralPath D:\HouseExpenseTracker\mobile\android\app\build\outputs\apk\release\app-release.apk -Destination D:\HouseExpenseTracker\docs\downloads\sora-expense-latest.apk -Force
Get-FileHash D:\HouseExpenseTracker\docs\downloads\sora-expense-latest.apk -Algorithm SHA256
```

Static site folder:

```text
D:\HouseExpenseTracker\docs
```
