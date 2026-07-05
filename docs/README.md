# Sora Expense Download Page

This folder is a static APK download page for Sora Expense.

Recommended hosting:

- GitHub Pages: `main` branch, `/docs` folder.
- Render Static Site: publish directory `docs`, no build command.

Open locally:

```powershell
Start-Process D:\HouseExpenseTracker\docs\index.html
```

Refresh the bundled APK after a new release build:

```powershell
Copy-Item -LiteralPath D:\HouseExpenseTracker\mobile\android\app\build\outputs\apk\release\app-release.apk -Destination D:\HouseExpenseTracker\docs\downloads\sora-expense-latest.apk -Force
Get-FileHash D:\HouseExpenseTracker\docs\downloads\sora-expense-latest.apk -Algorithm SHA256
```

If the APK changes, update the file size, date, and SHA-256 in `index.html`.
