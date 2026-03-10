# Build APK Script for HR Management System
# Run this script to build a fresh debug APK

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  HR Management APK Builder" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# Set JAVA_HOME
$javaHome = "C:\Program Files\Android\Android Studio\jbr"
if (Test-Path $javaHome) {
    $env:JAVA_HOME = $javaHome
    Write-Host "✓ JAVA_HOME set: $javaHome" -ForegroundColor Green
} else {
    Write-Host "✗ Android Studio JBR not found" -ForegroundColor Red
    Write-Host "  Please set JAVA_HOME manually" -ForegroundColor Yellow
    exit 1
}

# Navigate to android directory
$androidDir = Join-Path $PSScriptRoot "android"
if (-not (Test-Path $androidDir)) {
    Write-Host "✗ Android directory not found" -ForegroundColor Red
    exit 1
}

Set-Location $androidDir
Write-Host "✓ Changed to android directory" -ForegroundColor Green
Write-Host ""

# Clean build
Write-Host "Step 1: Cleaning previous builds..." -ForegroundColor Yellow
.\gradlew clean --no-daemon
if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ Clean failed" -ForegroundColor Red
    exit 1
}
Write-Host "✓ Clean completed" -ForegroundColor Green
Write-Host ""

# Build APK
Write-Host "Step 2: Building debug APK (this may take 5-10 minutes)..." -ForegroundColor Yellow
.\gradlew assembleDebug --no-daemon --warning-mode all
if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ Build failed" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "  BUILD SUCCESSFUL!" -ForegroundColor Green  
Write-Host "============================================" -ForegroundColor Green
Write-Host ""

# Show APK details
$apkPath = Join-Path $androidDir "app\build\outputs\apk\debug\app-debug.apk"
if (Test-Path $apkPath) {
    $apk = Get-Item $apkPath
    Write-Host "APK Location:" -ForegroundColor Cyan
    Write-Host "  $($apk.FullName)" -ForegroundColor White
    Write-Host ""
    Write-Host "APK Details:" -ForegroundColor Cyan
    Write-Host "  Size: $([math]::Round($apk.Length/1MB,2)) MB" -ForegroundColor White
    Write-Host "  Modified: $($apk.LastWriteTime)" -ForegroundColor White
    Write-Host ""
    Write-Host "To install on your phone:" -ForegroundColor Yellow
    Write-Host "  1. Copy APK to your phone" -ForegroundColor White
    Write-Host "  2. Open the APK file on your phone" -ForegroundColor White
    Write-Host "  3. Allow installation from unknown sources if prompted" -ForegroundColor White
    Write-Host "  4. Install and test!" -ForegroundColor White
    Write-Host ""
    Write-Host "Or use ADB:" -ForegroundColor Yellow
    Write-Host "  adb install -r `"$apkPath`"" -ForegroundColor White
} else {
    Write-Host "✗ APK not found at expected location" -ForegroundColor Red
}

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan

# Return to original directory
Set-Location $PSScriptRoot
