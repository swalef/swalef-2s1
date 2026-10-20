@echo off
title 🎭 سوالف - لعبة برا السالفة
color 0A
echo.
echo  ==========================================
echo   🎭  سوالف - لعبة برا السالفة
echo  ==========================================
echo.

echo [1/2] تشغيل السيرفر (المنفذ 3001)...
start "🎮 Swalef Server" cmd /k "cd /d %~dp0server && node index.js"

timeout /t 2 /nobreak >nul

echo [2/2] تشغيل الواجهة (المنفذ 5173)...
start "🎨 Swalef Client" cmd /k "cd /d %~dp0client && npm run dev"

timeout /t 3 /nobreak >nul

echo.
echo  ==========================================
echo   ✅  اللعبة شغالة!
echo   🌐  افتح المتصفح على: http://localhost:5173
echo  ==========================================
echo.

start "" "http://localhost:5173"

pause
