# TorrentKu (React + FastAPI)

Sebuah aplikasi web modern untuk download torrent dengan performa tinggi (hingga 9 Gbps), berbasis React dan FastAPI.

## Fitur
- 🚀 **Performa Tinggi**: Menggunakan setelan libtorrent yang dioptimalkan (8000 koneksi, cache disk 512MB).
- 💎 **Premium UI**: Desain Glassmorphism yang modern dengan Framer Motion.
- ⚡ **Real-time Status**: Update progress secara instant menggunakan WebSockets.
- 📂 **Multi-Job**: Kelola banyak download sekaligus.

## Cara Menjalankan

### 1. Jalankan Backend (FastAPI)
Buka terminal baru dan jalankan:
```bash
cd backend
python main.py
```
Backend akan berjalan di `http://localhost:8000`.

### 2. Jalankan Frontend (React)
Buka terminal baru lainnya dan jalankan:
```bash
cd web-app
npm run dev
```
Frontend akan berjalan di `http://localhost:5173`.

## Persyaratan
- Python 3.10+
- Node.js & npm
- libtorrent (`pip install libtorrent`)

## Catatan
Pastikan port 8000 dan 5173 tidak terpakai oleh aplikasi lain.
