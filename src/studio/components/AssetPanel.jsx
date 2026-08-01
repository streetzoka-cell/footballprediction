import React from 'react';
import { useEditorStore } from '../store/editorStore';
import { X } from 'lucide-react';

const STICKERS = ['⚽', '🔥', '🏆', '🟨', '🟥', '👟', '🥅', '💯', '🤯', '👏', '👑', '🚀', '📈', '⚡', '🛡️', '🎯'];
const BACKGROUNDS = [
  { name: 'Dark', fill: '#05070a' }, { name: 'Black', fill: '#000000' }, { name: 'White', fill: '#ffffff' },
  { name: 'Pitch', fill: '#15803d' }, { name: 'Blue', fill: '#0ea5e9' }, { name: 'Gold', fill: '#f59e0b' },
  { name: 'Gradient', fill: 'linear-gradient(135deg, #047857, #05070a)' }
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
    <div className="studio-panel-container">
      <div className="studio-panel-header">
        <h2 className="studio-panel-title">Assets & Stickers</h2>
        <button onClick={onClose} className="studio-panel-close"><X size={20} /></button>
      </div>
      
      <div className="studio-section-title">Backgrounds</div>
      <div className="studio-grid-4">
        {BACKGROUNDS.map((bg, i) => (
          <button key={i} onClick={() => setBackground(bg)} className="studio-bg-btn" style={{ background: bg.fill.includes('linear') ? bg.fill : bg.fill, color: bg.name === 'White' || bg.name === 'Gold' ? '#000' : '#fff' }}>{bg.name}</button>
        ))}
      </div>

      <div className="studio-section-title">Football Stickers</div>
      <div className="studio-grid-4">
        {STICKERS.map((emoji, i) => (
          <button key={i} onClick={() => addSticker(emoji)} className="studio-sticker-btn">{emoji}</button>
        ))}
      </div>

      <div className="studio-section-title">Sound Effects (SFX)</div>
      <div className="studio-grid-2">
        {SFX.map((sfx, i) => (
          <button key={i} onClick={() => addSFX(sfx)} className="studio-sfx-btn">
            🎵 {sfx.name}
          </button>
        ))}
      </div>
    </div>
  );
}