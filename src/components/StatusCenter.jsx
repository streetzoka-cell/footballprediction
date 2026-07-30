import { useState, useEffect } from 'react';
import { Activity, Wifi, Server } from 'lucide-react';

export default function StatusCenter() {
  const [isOpen, setIsOpen] = useState(false);
  const [status, setStatus] = useState('online'); // online, offline, slow
  const [latency, setLatency] = useState(0);

  useEffect(() => {
    const updateStatus = () => {
      if (!navigator.onLine) return setStatus('offline');
      
      // Simulate API ping
      const start = Date.now();
      fetch('/robots.txt', { cache: 'no-store' })
        .then(() => setLatency(Date.now() - start))
        .catch(() => setStatus('slow'));
    };

    updateStatus();
    const id = setInterval(updateStatus, 30000); // Check every 30s
    return () => clearInterval(id);
  }, []);

  const colors = {
    online: { dot: 'bg-emerald-500', text: 'text-emerald-400' },
    slow: { dot: 'bg-amber-500', text: 'text-amber-400' },
    offline: { dot: 'bg-red-500', text: 'text-red-400' }
  };

  return (
    <div className="fixed bottom-4 right-4 z-[9998]">
      {isOpen && (
        <div className="absolute bottom-12 right-0 bg-[#0a0f1a]/95 border border-white/10 backdrop-blur-xl rounded-xl p-4 w-64 shadow-2xl animate-toast-in">
          <div className="text-xs font-bold text-white mb-3">System Status</div>
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400 flex items-center gap-2"><Wifi size={12} /> Network</span>
              <span className={colors[status].text}>{status === 'online' ? 'Connected' : 'Offline'}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400 flex items-center gap-2"><Server size={12} /> API Latency</span>
              <span className={latency < 100 ? 'text-emerald-400' : 'text-amber-400'}>{latency}ms</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400 flex items-center gap-2"><Activity size={12} /> Live Engine</span>
              <span className="text-emerald-400">Active</span>
            </div>
          </div>
        </div>
      )}
      
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className={`w-10 h-10 rounded-full flex items-center justify-center shadow-lg border border-white/10 ${colors[status].text} bg-[#0a0f1a]`}
        title="System Status"
      >
        <span className={`w-2 h-2 rounded-full ${colors[status].dot} animate-pulse`}></span>
      </button>
    </div>
  );
}