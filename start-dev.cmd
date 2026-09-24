@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo   Suishi / 岁时  --  Expo dev server
echo   --------------------------------------------------
echo   Keep this window OPEN while using the app.
echo   Scan the QR code below with Expo Go on your phone.
echo   Press Ctrl+C here to stop the server.
echo.
echo   Local IP hint: run  ipconfig  and look for the
echo   IPv4 address of your active WLAN / Ethernet adapter.
echo.
npm start -- --lan
echo.
echo   Server stopped.
pause
