# 🧲 Torrents to Google Drive

Download torrents directly to Google Drive using Google Colab, or run locally as a standalone Python script.

## Features

- ✅ Compatible with **Python 3.10 – 3.13+**
- ✅ Uses modern **libtorrent 2.0+** API (no deprecated functions)
- ✅ Works on **Google Colab** and **locally** (Windows/macOS/Linux)
- ✅ ETA calculation and detailed progress display
- ✅ CLI argument support for automation (local script)
- ✅ Visual progress bar with `clear_output` (Colab notebook)

## Why use this?

1. **Fast downloads** — leverage Google's server speed (via Colab)
2. **Access anywhere** — files are saved to Google Drive
3. **Bypass restrictions** — bypass ISP torrent restrictions through Colab
4. **Mobile friendly** — manage downloads from your phone

## Quick Start

### Option 1: Google Colab (Recommended)

[![Open In Colab](https://colab.research.google.com/assets/colab-badge.svg)](https://colab.research.google.com/github/dabare/torrents-to-google_drive/blob/main/torrent_downloader_colab.ipynb)

1. Open `torrent_downloader_colab.ipynb` in Google Colab
2. Run all cells — follow the prompts
3. Files will be downloaded to `My Drive/Torrent/`

> **Note:** The notebook tries `pip install libtorrent` first. If that fails (no wheel for your Colab Python version), it automatically falls back to `apt-get install python3-libtorrent`.

### Option 2: Run Locally

```bash
# Install dependencies
pip install -r requirements.txt

# On Windows you may also need:
pip install libtorrent-windows-dll

# Interactive mode
python torrent_downloader.py

# With arguments
python torrent_downloader.py "magnet:?xt=urn:btih:..." --save-path ./downloads
```

## Requirements

- Python 3.10+ (tested on 3.13)
- libtorrent 2.0+ (`pip install libtorrent`)
- Windows: `libtorrent-windows-dll` (for OpenSSL DLLs)
- Visual C++ Redistributable (Windows only)

## Project Structure

```
├── torrent_downloader.py          # Standalone CLI script (local use)
├── torrent_downloader_colab.ipynb # Updated Colab notebook
├── torrent downloader.ipynb       # Original notebook (archived)
├── requirements.txt               # Python dependencies
└── README.md
```

## Migration Notes (from original)

The original notebook used deprecated APIs incompatible with modern Python:

| Old (Python < 3.10)            | New (Python 3.10+)                              |
|-------------------------------|--------------------------------------------------|
| `pip install lbry-libtorrent` | `pip install libtorrent`                         |
| `ses.listen_on(6881, 6891)`   | Dict settings: `listen_interfaces`               |
| `lt.add_magnet_uri(ses, ...)` | `lt.parse_magnet_uri()` + `ses.add_torrent()`    |
| `handle.has_metadata()`       | `handle.torrent_file() is None`                  |
| `handle.name()`               | `handle.torrent_file().name()`                   |
| `ses.start_dht()`             | Dict settings: `enable_dht: True`                |
| `storage_mode_t(2)`           | Default storage mode (automatic)                 |

## ⚠️ Disclaimer

This is purely for educational purposes.
