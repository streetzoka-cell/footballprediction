import React from 'react';
import { useEditorStore } from '../store/proEditorStore';
import { X } from 'lucide-react';

const STICKERS = ['⚽', '🔥', '🏆', '🟨', '🟥', '👟', '🥅', '💯', '🤯', '👏', '👑', '🚀', '📈', '⚡', '🛡️', '🎯'];
const BACKGROUNDS = [
  { name: 'Dark', fill: '#0f172a' }, { name: 'Black', fill: '#000000' }, { name: 'White', fill: '#ffffff' },
  { name: 'Pitch', fill: '#15803d' }, { name: 'Blue', fill: '#0ea5e9' }, { name: 'Gold', fill: '#f59e0b' },
  { name: 'Gradient', fill: 'linear-gradient(135deg, #1e3a8a, #0f172a)' }
];

const SFX = [
  { name: 'Stadium Whistle', src: 'https://cdn.jsdelivr.net/gh/anars/blank-audio@master/1-second-of-silence.mp3' },
  { name: 'Crowd Cheer', src: 'https://cdn.jsdelivr.net/gh/anars/blank-audio@master/1-second-of-silence.mp3' },
  { name: 'Goal Horn', src: 'https://cdn.jsdelivr.net/gh/anars/blank-audio@master/1-second-of-silence.mp3' },
];

export default function AssetPanel({ onClose }) {
  const { addLayer, updateLayer, project } = useEditorStore();

  const addSticker = (emoji) => {
    addLayer({ type: 'text', text: emoji, x: 450, y: 850, fontSize: 150, fill: '#ffffff', fontFamily: 'Inter, sans-serif' });
    onClose();
  };

  const setBackground = (bg) => {
    const existingBg = project.layers.find(l => l.id === 'background_base');
    if (existingBg) {
      updateLayer(existingBg.id, { fill: bg.fill, isGradient: bg.name === 'Gradient' });
    } else {
      addLayer({ id: 'background_base', type: 'rect', x: 0, y: 0, width: project.canvasSize.width, height: project.canvasSize.height, fill: bg.fill, isGradient: bg.name === 'Gradient', cornerRadius: 0 });
    }
  };

  const addSFX = (sfx) => {
    addLayer({ type: 'audio', src: sfx.src, name: sfx.name, volume: 1 });
    onClose();
  };

  return (
    <div style={{ background: '#111827', borderTop: '1px solid #1f2937', padding: '24px', height: '100%', overflowY: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h2 style={{ color: '#fff', fontSize: '18px', fontWeight: 800 }}>Assets & Stickers</h2>
        <button onClick={onClose} style={{ color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} /></button>
      </div>
      
      <div style={{ fontSize: '12px', color: '#64748b', textTransform: 'uppercase', fontWeight: 800, marginBottom: '12px' }}>Backgrounds</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '30px' }}>
        {BACKGROUNDS.map((bg, i) => (
          <button key={i} onClick={() => setBackground(bg)} style={{ background: bg.fill.includes('linear') ? bg.fill : bg.fill, border: '1px solid #334155', borderRadius: '8px', height: '60px', cursor: 'pointer', color: bg.name === 'White' || bg.name === 'Gold' ? '#000' : '#fff', fontSize: '10px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{bg.name}</button>
        ))}
      </div>

      <div style={{ fontSize: '12px', color: '#64748b', textTransform: 'uppercase', fontWeight: 800, marginBottom: '12px' }}>Football Stickers</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '30px' }}>
        {STICKERS.map((emoji, i) => (
          <button key={i} onClick={() => addSticker(emoji)} style={{ background: '#1f2937', border: '1px solid #334155', borderRadius: '12px', height: '70px', cursor: 'pointer', fontSize: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{emoji}</button>
        ))}
      </div>

      <div style={{ fontSize: '12px', color: '#64748b', textTransform: 'uppercase', fontWeight: 800, marginBottom: '12px' }}>Sound Effects (SFX)</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
        {SFX.map((sfx, i) => (
          <button key={i} onClick={() => addSFX(sfx)} style={{ background: '#1f2937', border: '1px solid #334155', borderRadius: '8px', padding: '12px', cursor: 'pointer', color: '#fff', fontSize: '12px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
            🎵 {sfx.name}
          </button>
        ))}
      </div>
    </div>
  );
}