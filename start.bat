@echo off
title سوالف - لعبة برا السالفة
echo.
echo ==========================================
echo  سوالف - خادم اللعبة الموحد
echo ==========================================
echo.

echo [1/2] بناء الواجهة المحدثة...
call npm --prefix client run build

echo.
echo [2/2] تشغيل الخادم الموحد على المنفذ 3001...
start "Swalef Server" cmd /k "cd /d %~dp0 && node server/index.js"

timeout /t 2 /nobreak >nul

echo.
echo ==========================================
echo  تم تشغيل اللعبة بنجاح
echo  الرابط المحلي: http://localhost:3001
echo ==========================================
echo.

start "" "http://localhost:3001"

pause
