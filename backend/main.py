import os
import shutil
import time
import datetime
import asyncio
from typing import Dict, List, Optional
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import libtorrent as lt

app = FastAPI(title="Torrents to Google Drive API")

# Enable CORS (Super Permissive for Troubleshooting)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configuration
SAVE_PATH = os.path.join(os.getcwd(), "downloads")
if not os.path.exists(SAVE_PATH):
    os.makedirs(SAVE_PATH)

# State labels for torrent status
STATE_STR = [
    "queued",
    "checking",
    "downloading metadata",
    "downloading",
    "finished",
    "seeding",
    "allocating",
    "checking fastresume",
]

class TorrentStatus(BaseModel):
    id: str
    name: str
    progress: float
    download_rate: float
    upload_rate: float
    num_peers: int
    state: str
    total_size: int
    total_done: int
    eta: str
    save_path: str
    paused: bool

class MagnetRequest(BaseModel):
    magnet_link: str
    save_path: Optional[str] = None

class TorrentManager:
    def __init__(self):
        self.ses = self._create_session()
        self.handles: Dict[str, lt.torrent_handle] = {}
        self.status_cache: Dict[str, dict] = {}

    def _create_session(self) -> lt.session:
        settings = {
            "listen_interfaces": "0.0.0.0:6881,[::]:6881",
            "enable_dht": True,
            "enable_lsd": True,
            "enable_upnp": True,
            "enable_natpmp": True,
            "connections_limit": 8000,
            "unchoke_slots_limit": -1,
            "half_open_limit": 0,
            "download_rate_limit": 0,
            "upload_rate_limit": 0,
            "cache_size": 32768,
            "cache_size_volatile": 2048,
            "aio_threads": 32,
            "file_pool_size": 200,
            "max_queued_disk_bytes": 16 * 1024 * 1024,
            "recv_socket_buffer_size": 4 * 1024 * 1024,
            "send_socket_buffer_size": 4 * 1024 * 1024,
            "send_buffer_watermark": 4 * 1024 * 1024,
            "send_buffer_watermark_factor": 150,
            "send_buffer_low_watermark": 512 * 1024,
            "mixed_mode_algorithm": 0,
            "request_queue_time": 5,
            "max_out_request_queue": 1500,
            "max_allowed_in_request_queue": 5000,
            "piece_extent_affinity": True,
            "suggest_mode": 1,
            "max_suggest_pieces": 64,
            "max_rejects": 100,
            "choking_algorithm": 1,
            "seed_choking_algorithm": 1,
            "num_optimistic_unchoke_slots": 4,
            "unchoke_interval": 10,
            "optimistic_unchoke_interval": 20,
            "active_downloads": 20,
            "active_seeds": 20,
            "active_limit": 500,
            "alert_queue_size": 10000,
        }
        return lt.session(settings)

    def add_magnet(self, magnet_link: str, save_path: str = SAVE_PATH) -> str:
        try:
            params = lt.parse_magnet_uri(magnet_link)
            params.save_path = save_path
            
            # Standardize info_hash to clean lowercase hex string
            # Handle libtorrent 1.2.x and 2.0.x differences
            if hasattr(params, 'info_hashes'):
                info_hash = str(params.info_hashes.v1).lower()
            else:
                info_hash = str(params.info_hash).lower()
            
            if info_hash in self.handles:
                print(f"Torrent {info_hash} already exists.")
                return info_hash

            handle = self.ses.add_torrent(params)
            self.handles[info_hash] = handle
            print(f"Added torrent: {info_hash}")
            return info_hash
        except Exception as e:
            print(f"Add Torrent Error: {e}")
            raise e

    def get_status(self, torrent_id: str) -> Optional[dict]:
        # Always use lowercase for lookup
        tid = str(torrent_id).lower()
        if tid not in self.handles:
            return None
        
        handle = self.handles[tid]
        if not handle.is_valid():
            return None
            
        s = handle.status()
        
        # Get name (might involve waiting for metadata)
        name = s.name
        try:
            ti = handle.torrent_file()
            if ti:
                name = ti.name()
        except:
            pass

        # ETA calculation
        eta_str = "N/A"
        if s.download_rate > 0:
            remaining_bytes = s.total_wanted - s.total_wanted_done
            if remaining_bytes > 0:
                eta_seconds = remaining_bytes / s.download_rate
                # Cap ETA to 100 days to prevent OverflowError
                if eta_seconds > 8640000:
                    eta_str = "> 100 days"
                else:
                    eta_str = str(datetime.timedelta(seconds=int(eta_seconds)))
            else:
                eta_str = "0:00:00"

        state = STATE_STR[s.state] if s.state < len(STATE_STR) else "unknown"

        status = {
            "id": torrent_id,
            "name": name if name else f"Magnet ({torrent_id[:8]}...)",
            "progress": s.progress * 100,
            "download_rate": s.download_rate,
            "upload_rate": s.upload_rate,
            "num_peers": s.num_peers,
            "state": state,
            "total_size": s.total_wanted,
            "total_done": s.total_wanted_done,
            "eta": eta_str,
            "save_path": s.save_path,
            "paused": bool(s.flags & lt.torrent_flags.paused)
        }
        return status

    def get_all_statuses(self) -> List[dict]:
        statuses = []
        for tid in list(self.handles.keys()):
            status = self.get_status(tid)
            if status:
                statuses.append(status)
        return statuses

    def toggle_pause(self, torrent_id: str, pause: bool):
        torrent_id = torrent_id.lower()
        if torrent_id in self.handles:
            handle = self.handles[torrent_id]
            if pause:
                handle.pause()
                print(f"Paused torrent: {torrent_id}")
            else:
                handle.resume()
                print(f"Resumed torrent: {torrent_id}")
        return True

    def remove_torrent(self, torrent_id: str, remove_files: bool = False):
        torrent_id = torrent_id.lower()
        if torrent_id in self.handles:
            handle = self.handles[torrent_id]
            
            # Get info before removal
            try:
                status = handle.status()
                save_path = status.save_path
                name = status.name
            except:
                return False

            # 1. Stop and remove from libtorrent session
            # Do not pass keyword argument 'delete_files=' as it fails in PyBind C++ bindings
            if remove_files:
                self.ses.remove_torrent(handle, 1) # 1 = delete files option in libtorrent
            else:
                self.ses.remove_torrent(handle)
            
            # 2. Remove from our tracking
            del self.handles[torrent_id]
            print(f"Removed torrent from session: {name}")

            # 3. If Windows locked the files, wait a bit and force delete if requested
            if remove_files:
                def cleanup():
                    time.sleep(1) # Wait for OS to release locks
                    full_path = os.path.join(save_path, name)
                    if os.path.exists(full_path):
                        try:
                            if os.path.isdir(full_path):
                                shutil.rmtree(full_path, ignore_errors=True)
                            else:
                                os.remove(full_path)
                            print(f"Forced disk cleanup success: {name}")
                        except Exception as e:
                            print(f"Disk cleanup error: {e}")
                
                # Run cleanup in a separate thread/task so it doesn't block the API response
                asyncio.create_task(asyncio.to_thread(cleanup))

            return True
        return False

manager = TorrentManager()

@app.post("/api/torrents")
async def add_torrent(req: MagnetRequest):
    try:
        save_path = req.save_path or SAVE_PATH
        torrent_id = manager.add_magnet(req.magnet_link, save_path)
        return {"id": torrent_id, "message": "Torrent added successfully"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/torrents")
async def list_torrents():
    return manager.get_all_statuses()

@app.delete("/api/torrents/{torrent_id}")
async def remove_torrent_api(torrent_id: str, delete_files: bool = False):
    if manager.remove_torrent(torrent_id, delete_files):
        return {"message": "Torrent removed"}
    raise HTTPException(status_code=404, detail="Torrent not found")

class SettingsRequest(BaseModel):
    save_path: str

class DirListRequest(BaseModel):
    current_path: Optional[str] = None

@app.get("/api/settings")
async def get_settings():
    global SAVE_PATH
    return {"save_path": SAVE_PATH}

@app.put("/api/settings")
async def update_settings(req: SettingsRequest):
    global SAVE_PATH
    SAVE_PATH = req.save_path
    if not os.path.exists(SAVE_PATH):
        try:
            os.makedirs(SAVE_PATH)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Cannot create directory: {e}")
    return {"message": "Settings updated", "save_path": SAVE_PATH}

@app.post("/api/directories")
async def list_directories(req: DirListRequest):
    import string
    current_path = req.current_path

    try:
        # If no path, return Windows root drives
        if not current_path:
            drives = []
            for letter in string.ascii_uppercase:
                drive = f"{letter}:\\"
                if os.path.exists(drive):
                    drives.append({"name": drive, "path": drive})
            return {"current_path": "", "parent": None, "directories": drives}

        if not os.path.isdir(current_path):
            raise HTTPException(status_code=400, detail="Invalid directory")
        
        # Calculate parent path securely
        parent = os.path.dirname(current_path)
        if parent == current_path: # At the root of a drive (e.g., C:\)
            parent = ""
            
        directories = []
        for item in os.listdir(current_path):
            item_path = os.path.join(current_path, item)
            # Ensure it is a directory and not a system volume information or hidden file
            if os.path.isdir(item_path):
                try: # Check permission
                    os.listdir(item_path)
                    directories.append({"name": item, "path": item_path})
                except (PermissionError, FileNotFoundError):
                    pass
        
        # Sort directories alphabetically by name
        directories.sort(key=lambda x: x["name"].lower())
        
        return {"current_path": current_path, "parent": parent, "directories": directories}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/torrents/{torrent_id}/pause")
async def pause_torrent(torrent_id: str):
    if manager.toggle_pause(torrent_id, True):
        return {"message": "Torrent paused"}
    raise HTTPException(status_code=404, detail="Torrent not found")

@app.post("/api/torrents/{torrent_id}/resume")
async def resume_torrent(torrent_id: str):
    if manager.toggle_pause(torrent_id, False):
        return {"message": "Torrent resumed"}
    raise HTTPException(status_code=404, detail="Torrent not found")

@app.websocket("/ws/status")
async def websocket_status(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            statuses = manager.get_all_statuses()
            await websocket.send_json(statuses)
            await asyncio.sleep(2)
    except WebSocketDisconnect:
        pass
    except Exception as e:
        print(f"WS Error: {e}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
