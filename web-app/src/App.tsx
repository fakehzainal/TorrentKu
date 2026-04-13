import React, { useState, useEffect, useRef } from 'react';
import {
  Download,
  Plus,
  Trash2,
  Play,
  Pause,
  CloudDownload,
  CheckCircle2,
  Clock,
  Users,
  ArrowUp,
  ArrowDown,
  Settings,
  X,
  Folder,
  ChevronRight,
  ArrowLeft,
  HardDrive
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const API_BASE = 'http://127.0.0.1:8000';

interface Torrent {
  id: string;
  name: string;
  progress: number;
  download_rate: number;
  upload_rate: number;
  num_peers: number;
  state: string;
  total_size: number;
  total_done: number;
  eta: string;
  save_path: string;
  paused: boolean;
}

const formatSpeed = (bps: number) => {
  const mb = bps / (1024 * 1024);
  if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB/s`;
  return `${mb.toFixed(2)} MB/s`;
};

const formatSize = (bytes: number) => {
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`;
  return `${mb.toFixed(2)} MB`;
};

const TorrentCard = ({ 
  torrent, 
  onTogglePause,
  onRemove
}: { 
  torrent: Torrent, 
  onTogglePause: (id: string, isPaused: boolean) => void,
  onRemove: (e: React.MouseEvent, torrent: Torrent) => void
}) => {
  const isFinished = torrent.progress >= 100 || torrent.state === 'finished' || torrent.state === 'seeding';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -100 }}
      className="glass-card mb-4 p-5 rounded-2xl flex flex-col gap-4 relative overflow-hidden"
    >
      <div className="flex justify-between items-start gap-4 relative">
        <div className="flex-1 z-10 relative">
          <h3 className="text-xl font-bold truncate max-w-[80%] text-white/90 mb-1">
            {torrent.name || 'Fetching metadata...'}
          </h3>
          <p className="text-sm text-white/50 flex items-center gap-2">
            <span className="bg-white/10 px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider text-purple-400">
              {torrent.state}
            </span>
            {isFinished && <CheckCircle2 size={16} className="text-green-400 animate-pulse" />}
            <span className="flex items-center gap-1"><Clock size={14} /> {torrent.eta}</span>
            <span className="flex items-center gap-1"><Users size={14} /> {torrent.num_peers} peers</span>
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onTogglePause(torrent.id, torrent.paused)}
            className={`p-2 rounded-lg transition-colors relative z-50 flex items-center justify-center ${
              torrent.paused 
                ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30' 
                : 'bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30'
            }`}
            title={torrent.paused ? "Resume" : "Pause"}
          >
            {torrent.paused ? <Play size={20} fill="currentColor" /> : <Pause size={20} fill="currentColor" />}
          </button>
          <button
            type="button"
            onClick={(e) => onRemove(e, torrent)}
            className="p-2 bg-red-500/10 text-red-400/60 hover:bg-red-500/20 hover:text-red-400 transition-all rounded-lg relative z-50 flex items-center justify-center border border-red-500/10 hover:border-red-500/30"
            title="Remove Torrent"
          >
            <Trash2 size={20} />
          </button>
        </div>
      </div>

      <div className="w-full bg-white/5 rounded-full h-3 overflow-hidden z-10 relative">
        <motion.div
          className="h-full bg-gradient-to-r from-purple-500 to-pink-500"
          initial={{ width: 0 }}
          animate={{ width: `${torrent.progress}%` }}
          transition={{ duration: 0.5 }}
        />
        {torrent.progress > 0 && torrent.progress < 100 && (
          <div className="absolute top-0 bottom-0 left-0 right-0 animate-pulse pointer-events-none bg-gradient-to-r from-transparent via-white/10 to-transparent" />
        )}
      </div>

      <div className="flex justify-between items-center z-10 text-sm font-medium">
        <div className="flex gap-4">
          <div className="flex items-center gap-1.5 text-blue-400">
            <ArrowDown size={14} />
            <span>{formatSpeed(torrent.download_rate)}</span>
          </div>
          <div className="flex items-center gap-1.5 text-green-400">
            <ArrowUp size={14} />
            <span>{formatSpeed(torrent.upload_rate)}</span>
          </div>
        </div>
        <div className="text-white/70">
          {formatSize(torrent.total_done)} / {formatSize(torrent.total_size)} ({torrent.progress.toFixed(1)}%)
        </div>
      </div>
    </motion.div>
  );
};

export default function App() {
  const [torrents, setTorrents] = useState<Torrent[]>([]);
  const [magnet, setMagnet] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [tempSavePath, setTempSavePath] = useState('');
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  
  const [browserDirs, setBrowserDirs] = useState<{name: string, path: string}[]>([]);
  const [browserParent, setBrowserParent] = useState<string | null>(null);
  const [isLoadingDirs, setIsLoadingDirs] = useState(false);

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [torrentToDelete, setTorrentToDelete] = useState<Torrent | null>(null);

  const ws = useRef<WebSocket | null>(null);
  const pendingDeletes = useRef<Set<string>>(new Set());

  useEffect(() => {
    // Initial fetch
    fetchTorrents();
    fetchSettings();

    // WebSocket connect
    connectWS();

    return () => {
      if (ws.current) ws.current.close();
    };
  }, []);

  const connectWS = () => {
    const socket = new WebSocket('ws://127.0.0.1:8000/ws/status');

    socket.onopen = () => {
      console.log('Connected to WebSocket');
      setIsLoading(false);
    };

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data) as Torrent[];
      // Filter out items that are currently being deleted to prevent flickering
      const filtered = data.filter(t => !pendingDeletes.current.has(t.id));
      setTorrents(filtered);
    };

    socket.onclose = () => {
      console.log('WS disconnected, retrying...');
      setTimeout(connectWS, 3000);
    };

    ws.current = socket;
  };

  const fetchTorrents = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/torrents`);
      const data = await response.json() as Torrent[];
      const filtered = data.filter(t => !pendingDeletes.current.has(t.id));
      setTorrents(filtered);
      setIsLoading(false);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchSettings = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/settings`);
      const data = await response.json();
      setTempSavePath(data.save_path);
    } catch (err) {
      console.error('Failed to fetch settings', err);
    }
  };

  const fetchDirectories = async (path: string = '') => {
    setIsLoadingDirs(true);
    try {
      const response = await fetch(`${API_BASE}/api/directories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current_path: path })
      });
      const data = await response.json();
      setTempSavePath(data.current_path);
      setBrowserParent(data.parent);
      setBrowserDirs(data.directories);
    } catch (err) {
      console.error('Failed to fetch directories', err);
    } finally {
      setIsLoadingDirs(false);
    }
  };

  const openSettings = () => {
    fetchDirectories(tempSavePath);
    setIsSettingsOpen(true);
  };

  const saveSettings = async () => {
    try {
      setIsSavingSettings(true);
      const response = await fetch(`${API_BASE}/api/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ save_path: tempSavePath })
      });
      if (response.ok) {
        setIsSettingsOpen(false);
      } else {
        throw new Error('Save failed');
      }
    } catch (err) {
      alert('Failed to save settings. Please ensure the path is valid.');
    } finally {
      setIsSavingSettings(false);
    }
  };

  const addTorrent = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!magnet) return;

    setIsAdding(true);
    try {
      const response = await fetch(`${API_BASE}/api/torrents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ magnet_link: magnet })
      });
      if (response.ok) {
        setMagnet('');
      } else {
        throw new Error('Add failed');
      }
    } catch (err) {
      alert('Failed to add torrent. Check magnet link.');
    } finally {
      setIsAdding(false);
    }
  };

  const togglePause = async (id: string, currentPaused: boolean) => {
    const action = currentPaused ? 'resume' : 'pause';
    
    // Optimistic update
    setTorrents(prev => prev.map(t => 
      t.id === id ? { ...t, paused: !currentPaused } : t
    ));

    try {
      await fetch(`${API_BASE}/api/torrents/${id}/${action}`, { method: 'POST' });
    } catch (err) {
      console.error(`Failed to ${action} torrent`, err);
      fetchTorrents(); 
    }
  };

  const promptRemoveTorrent = (e: React.MouseEvent, torrent: Torrent) => {
    e.stopPropagation();
    setTorrentToDelete(torrent);
    setDeleteModalOpen(true);
  };

  const confirmRemoveTorrent = async (deleteFiles: boolean) => {
    if (!torrentToDelete) return;
    
    const id = torrentToDelete.id;
    setDeleteModalOpen(false);
    setTorrentToDelete(null);
    
    // Add to pending to avoid flicker
    pendingDeletes.current.add(id);
    setTorrents(prev => prev.filter(t => t.id !== id));
    
    try {
      await fetch(`${API_BASE}/api/torrents/${id}?delete_files=${deleteFiles}`, {
        method: 'DELETE'
      });
      // Remove from pending after some time to ensure sync
      setTimeout(() => {
        pendingDeletes.current.delete(id);
      }, 5000);
    } catch (err) {
      console.error("Failed to remove torrent", err);
      pendingDeletes.current.delete(id);
      fetchTorrents(); // Rollback
    }
  };

  const totalSpeed = torrents.reduce((acc, t) => acc + t.download_rate, 0);

  return (
    <div className="min-h-screen py-10 px-4">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex justify-between items-center mb-8 md:mb-12 gap-4"
      >
        <div className="min-w-0">
          <h1 className="text-2xl md:text-4xl font-black gradient-text tracking-tight uppercase flex items-center gap-2 md:gap-3">
            <CloudDownload className="text-purple-500 fill-purple-500/20 shrink-0 w-8 h-8 md:w-12 md:h-12" />
            <span className="truncate">TorrentKu</span>
          </h1>
        </div>

        <div className="flex shrink-0 gap-2 md:gap-4">
          <button
            onClick={openSettings}
            className="glass px-3 py-1.5 md:px-4 md:py-2 flex items-center hover:bg-white/10 transition-colors text-white/60 hover:text-white"
            title="Settings"
          >
            <Settings size={18} />
          </button>
          <div className="glass px-3 py-1.5 md:px-4 md:py-2 flex items-center gap-2 md:gap-3">
            <div className={`w-2 h-2 rounded-full shrink-0 ${ws.current?.readyState === 1 ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-red-500'}`} />
            <span className="text-[10px] md:text-sm font-semibold uppercase tracking-wider text-white/60 whitespace-nowrap">
              {ws.current?.readyState === 1 ? (
                <>
                  <span className="hidden sm:inline">Live</span>
                  <span className="sm:hidden">Live</span>
                </>
              ) : (
                <>
                  <span className="hidden sm:inline">Connecting</span>
                  <span className="sm:hidden">...</span>
                </>
              )}
            </span>
          </div>
        </div>
      </motion.div>

      {/* Settings Modal */}
      <AnimatePresence>
        {isSettingsOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSettingsOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="glass p-6 md:p-8 rounded-3xl w-full max-w-lg z-10 relative overflow-hidden"
            >
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <Settings className="text-purple-400" />
                  Settings
                </h2>
                <button onClick={() => setIsSettingsOpen(false)} className="text-white/40 hover:text-white transition-colors">
                  <X size={24} />
                </button>
              </div>

              <div className="space-y-6">
                <div>
                  <label className="text-sm font-semibold text-white/60 uppercase tracking-wider mb-2 flex flex-col gap-1">
                    Download Destination
                    <span className="text-xs text-white/30 font-normal normal-case">Navigate and pick a folder to save your torrents</span>
                  </label>
                  
                  <div className="bg-black/20 rounded-xl border border-white/10 overflow-hidden mt-3">
                    {/* Browser Header */}
                    <div className="flex items-center gap-2 px-3 py-2 bg-white/5 border-b border-white/10 overflow-x-auto whitespace-nowrap">
                      {browserParent !== null && (
                        <button 
                          onClick={() => fetchDirectories(browserParent)}
                          className="p-1.5 hover:bg-white/10 rounded-lg text-white/50 hover:text-white transition-colors"
                          title="Go Up"
                        >
                          <ArrowLeft size={16} />
                        </button>
                      )}
                      <Folder size={14} className="text-purple-400 shrink-0" />
                      <span className="text-xs text-white/80 font-mono">{tempSavePath || 'This PC (Drives)'}</span>
                    </div>
                    
                    {/* Browser Body */}
                    <div className="h-48 overflow-y-auto p-1 custom-scrollbar bg-black/10">
                      {isLoadingDirs ? (
                        <div className="py-12 flex justify-center"><div className="animate-spin rounded-full h-6 w-6 border-2 border-white/50 border-t-white" /></div>
                      ) : browserDirs.length === 0 ? (
                        <div className="py-12 text-center text-white/30 text-xs">No subfolders found</div>
                      ) : (
                        browserDirs.map((dir, idx) => (
                          <button
                            key={idx}
                            onClick={() => fetchDirectories(dir.path)}
                            className="w-full text-left px-3 py-2 hover:bg-white/5 rounded-lg flex items-center justify-between group transition-colors"
                          >
                            <div className="flex items-center gap-3">
                               {tempSavePath === '' ? <HardDrive size={16} className="text-blue-400" /> : <Folder size={16} className="text-yellow-500" />}
                               <span className="text-sm text-white/80 group-hover:text-white truncate">{dir.name}</span>
                            </div>
                            <ChevronRight size={14} className="text-white/20 group-hover:text-white/60" />
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-white/10">
                  <button
                    onClick={() => setIsSettingsOpen(false)}
                    className="px-6 py-2 rounded-xl text-white/60 hover:bg-white/5 transition-colors font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={saveSettings}
                    disabled={isSavingSettings || !tempSavePath}
                    className="px-6 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 transition-colors font-bold flex items-center gap-2 shadow-lg shadow-purple-900/20"
                  >
                    {isSavingSettings ? <div className="animate-spin rounded-full h-4 w-4 border-2 border-white/50 border-t-white" /> : null}
                    Save Changes
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Modal */}
      <AnimatePresence>
        {deleteModalOpen && torrentToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDeleteModalOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="glass p-6 md:p-8 rounded-3xl w-full max-w-md z-10 relative overflow-hidden border border-red-500/20 shadow-2xl shadow-red-900/20"
            >
              <div className="flex flex-col items-center text-center mb-8">
                <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mb-5 text-red-500 border border-red-500/20">
                  <Trash2 size={32} />
                </div>
                <h2 className="text-2xl font-black text-white mb-2">Hapus Torrent?</h2>
                <p className="text-white/60 text-sm px-4">
                  Apakah kamu yakin ingin menghapus <span className="text-white font-bold">{torrentToDelete.name || 'torrent ini'}</span> dari daftar?
                </p>
              </div>

              <div className="flex gap-3 mt-2">
                <button
                  onClick={() => setDeleteModalOpen(false)}
                  className="flex-1 py-3.5 px-4 rounded-xl bg-white/5 hover:bg-white/10 transition-colors font-bold text-white/80 border border-white/10"
                >
                  Batal
                </button>
                <button
                  onClick={() => confirmRemoveTorrent(true)}
                  className="flex-1 py-3.5 px-4 rounded-xl bg-red-600 hover:bg-red-500 transition-colors font-bold text-white flex justify-center items-center gap-2 shadow-lg shadow-red-900/20 group"
                >
                  <Trash2 size={18} className="group-hover:scale-110 transition-transform" />
                  Hapus
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
        <div className="glass p-6 rounded-2xl border-l-4 border-l-purple-500">
          <div className="text-white/40 text-xs font-bold uppercase tracking-widest mb-2">Total Speed</div>
          <div className="text-3xl font-black text-white">{formatSpeed(totalSpeed)}</div>
        </div>
        <div className="glass p-6 rounded-2xl border-l-4 border-l-pink-500">
          <div className="text-white/40 text-xs font-bold uppercase tracking-widest mb-2">Active Jobs</div>
          <div className="text-3xl font-black text-white">{torrents.length}</div>
        </div>
        <div className="glass p-6 rounded-2xl border-l-4 border-l-blue-500">
          <div className="text-white/40 text-xs font-bold uppercase tracking-widest mb-2">System Load</div>
          <div className="text-3xl font-black text-white">LOW</div>
        </div>
      </div>

      {/* Input Bar */}
      <form onSubmit={addTorrent} className="relative mb-8 md:mb-12 group">
        <div className="absolute inset-y-0 left-0 pl-4 md:pl-6 flex items-center pointer-events-none">
          <Download size={20} className="text-white/40 group-focus-within:text-purple-400 transition-colors" />
        </div>
        <input
          type="text"
          value={magnet}
          onChange={(e) => setMagnet(e.target.value)}
          placeholder="Paste magnet link here..."
          className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 md:py-6 pl-12 md:pl-16 pr-20 md:pr-44 text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:bg-white/10 transition-all text-sm md:text-lg placeholder:text-white/20"
        />
        <button
          type="submit"
          disabled={isAdding || !magnet}
          className="absolute right-2 md:right-3 inset-y-2 md:inset-y-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold px-4 md:px-8 rounded-xl transition-all flex items-center gap-2 shadow-lg shadow-purple-900/20"
        >
          {isAdding ? (
            <div className="animate-spin rounded-full h-4 w-4 border-2 border-white/50 border-t-white" />
          ) : (
            <Plus size={20} />
          )}
          <span className="hidden md:inline text-sm">ADD TORRENT</span>
        </button>
      </form>

      {/* Torrent List */}
      <div className="space-y-4">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-sm font-bold text-white/30 uppercase tracking-[0.2em] flex items-center gap-2">
            Download Queue
            <span className="bg-white/5 px-2 py-0.5 rounded text-[10px] text-white/40">{torrents.length}</span>
          </h2>
        </div>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 text-white/20">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-white/10 border-t-purple-500 mb-4" />
            <p>Gathering torrent data...</p>
          </div>
        ) : torrents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 glass rounded-3xl border-dashed border-2 border-white/10">
            <Download size={48} className="text-white/10 mb-4" />
            <p className="text-xl font-bold text-white/30">No active downloads</p>
            <p className="text-white/20 mt-1">Start by adding a magnet link above</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            <AnimatePresence mode="popLayout">
              {torrents.map((torrent) => (
                <TorrentCard
                  key={torrent.id}
                  torrent={torrent}
                  onTogglePause={togglePause}
                  onRemove={promptRemoveTorrent}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>


      {/* Info Modal or Footer (Optional) */}
      <footer className="mt-20 text-center text-white/20 text-xs font-medium uppercase tracking-widest">
        Powered by libtorrent 2.0+ & FastAPI & React
      </footer>
    </div>
  );
}
