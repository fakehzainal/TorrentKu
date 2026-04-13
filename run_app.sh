#!/bin/bash
echo "Aplikasi sedang disiapkan..."

# Fungsi pembantu untuk mematikan semua background processes jika di-close
trap "kill 0" EXIT

echo "Memulai Backend (FastAPI)..."
(cd backend && python3 main.py) &

echo "Memulai Frontend (React Vite)..."
(cd web-app && npm run dev) &

echo ""
echo "🚀 Aplikasi berhasil dijalankan!"
echo "➡️  Backend:  http://localhost:8000"
echo "➡️  Frontend: http://localhost:5173"
echo "Tekan [CTRL + C] untuk menutup aplikasi sepenuhnya."
echo ""

# Menjaga agar terminal tetap terbuka
wait
