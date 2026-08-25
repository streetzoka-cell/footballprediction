import { useState, useEffect } from 'react';
import { Activity, Wifi, Server } from 'lucide-react';

export default function StatusCenter() {
  const [isOpen, setIsOpen] = useState(false);
  const [status, setStatus] = useState('online');
  const [latency, setLatency] = useState(0);

  useEffect(() => {
    const updateStatus = () => {
      if (!navigator.onLine) return setStatus('offline');
      const start = Date.now();
      fetch('/robots.txt', { cache: 'no-store' })
        .then(() => setLatency(Date.now() - start))
        .catch(() => setStatus('slow'));
    };

    updateStatus();
    const id = setInterval(updateStatus, 30000);
    return () => clearInterval(id);
  }, []);

  const statusColor = {
    online: 'text-success',
    slow: 'text-warning',
    offline: 'text-danger'
  };

  return (
    <div className="fixed bottom-4 right-4" style={{ zIndex: 9998 }}>
      {isOpen && (
        <div className="absolute bottom-12 right-0 bg-deep border border-glass-border backdrop-blur-xl rounded-xl p-16 w-64 shadow-xl anim-toast-in">
          <div className="text-xs font-bold text-primary mb-12">System Status</div>
          <div className="flex-col gap-8">
            <div className="flex-between text-xs">
              <span className="text-muted flex-center gap-8"><Wifi size={12} /> Network</span>
              <span className={statusColor[status]}>{status === 'online' ? 'Connected' : 'Offline'}</span>
            </div>
            <div className="flex-between text-xs">
              <span className="text-muted flex-center gap-8"><Server size={12} /> API Latency</span>
              <span className={latency < 100 ? 'text-success' : 'text-warning'}>{latency}ms</span>
            </div>
            <div className="flex-between text-xs">
              <span className="text-muted flex-center gap-8"><Activity size={12} /> Live Engine</span>
              <span className="text-success">Active</span>
            </div>
          </div>
        </div>
      )}
      
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className={`btn-icon ${statusColor[status]}`}
        style={{ background: 'var(--bg-deep)', border: '1px solid var(--border)' }}
        title="System Status"
      >
        <span className="w-2 h-2 rounded-full anim-pulse" style={{ background: 'currentColor' }}></span>
      </button>
    </div>
  );
}