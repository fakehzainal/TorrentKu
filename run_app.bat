@echo off
start cmd /k "python backend/main.py"
start cmd /k "cd web-app && npm run dev"
echo Aplikasi sedang dijalankan...
echo Backend: http://127.0.0.1:8000
echo Frontend: http://127.0.0.1:5173
pause
