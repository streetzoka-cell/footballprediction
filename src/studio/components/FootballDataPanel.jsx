import React from 'react';
import { useEditorStore } from '../store/editorStore';
import { Shirt, Tv, User } from 'lucide-react';

export default function FootballDataPanel({ onClose }) {
  const { project, addLayer } = useEditorStore();
  const match = project?.matchData;

  if (!match) return null;

  const homeName = match.homeTeam?.shortName || match.homeTeam?.name || 'Home';
  const awayName = match.awayTeam?.shortName || match.awayTeam?.name || 'Away';
  const homeLogo = match.homeTeam?.crest;
  const awayLogo = match.awayTeam?.crest;
  const homeScore = match.score?.fullTime?.home ?? 0;
  const awayScore = match.score?.fullTime?.away ?? 0;

  const addScorebug = () => {
    addLayer({ type: 'rect', x: 40, y: 1750, width: 450, height: 100, fill: 'rgba(5, 7, 10, 0.85)', cornerRadius: 12 });
    addLayer({ type: 'image', src: homeLogo, x: 60, y: 1770, width: 60, height: 60 });
    addLayer({ type: 'text', text: homeName, x: 140, y: 1780, fontSize: 28, fill: '#ffffff', fontStyle: 'bold' });
    addLayer({ type: 'text', text: `${homeScore}`, x: 350, y: 1770, fontSize: 40, fill: '#10b981', fontStyle: 'bold' });
    addLayer({ type: 'text', text: '-', x: 385, y: 1770, fontSize: 40, fill: '#ffffff' });
    addLayer({ type: 'text', text: `${awayScore}`, x: 410, y: 1770, fontSize: 40, fill: '#10b981', fontStyle: 'bold' });
    onClose();
  };

  const addFormation = () => {
    addLayer({ type: 'rect', x: 140, y: 400, width: 800, height: 1200, fill: '#15803d', cornerRadius: 12 });
    addLayer({ type: 'rect', x: 140, y: 990, width: 800, height: 4, fill: 'rgba(255,255,255,0.5)' });
    const positions = [
      { x: 540, y: 1520, num: 1 }, { x: 300, y: 1350, num: 2 }, { x: 420, y: 1350, num: 3 }, { x: 660, y: 1350, num: 4 }, { x: 780, y: 1350, num: 5 },
      { x: 340, y: 1150, num: 6 }, { x: 540, y: 1150, num: 7 }, { x: 740, y: 1150, num: 8 },
      { x: 320, y: 950, num: 9 }, { x: 540, y: 920, num: 10 }, { x: 760, y: 950, num: 11 }
    ];
    positions.forEach(p => {
      addLayer({ type: 'circle', x: p.x, y: p.y, radius: 30, fill: '#ffffff' });
      addLayer({ type: 'text', text: String(p.num), x: p.x - 12, y: p.y - 20, fontSize: 35, fill: '#000000', fontStyle: 'bold' });
    });
    onClose();
  };

  const addPlayerCard = (teamName, teamLogo, isHome) => {
    const bgColor = isHome ? '#047857' : '#7f1d1d';
    const cardX = 340, cardY = 500;
    addLayer({ type: 'rect', x: cardX, y: cardY, width: 400, height: 600, fill: bgColor, cornerRadius: 20 });
    addLayer({ type: 'rect', x: cardX + 10, y: cardY + 10, width: 380, height: 580, fill: 'transparent', stroke: '#fbbf24', strokeWidth: 2, cornerRadius: 16 });
    addLayer({ type: 'text', text: '91', x: cardX + 30, y: cardY + 30, fontSize: 60, fill: '#fbbf24', fontStyle: 'bold', fontFamily: 'Inter, sans-serif' });
    addLayer({ type: 'text', text: 'ST', x: cardX + 40, y: cardY + 100, fontSize: 30, fill: '#ffffff', fontStyle: 'bold', fontFamily: 'Inter, sans-serif' });
    addLayer({ type: 'image', src: teamLogo, x: cardX + 30, y: cardY + 150, width: 60, height: 60 });
    addLayer({ type: 'circle', x: cardX + 200, y: cardY + 250, radius: 80, fill: 'rgba(255,255,255,0.2)' });
    addLayer({ type: 'rect', x: cardX, y: cardY + 480, width: 400, height: 120, fill: 'rgba(5, 7, 10, 0.4)', cornerRadius: 0 });
    addLayer({ type: 'text', text: 'PLAYER NAME', x: cardX, y: cardY + 510, width: 400, align: 'center', fontSize: 36, fill: '#ffffff', fontStyle: 'bold', fontFamily: 'Inter, sans-serif' });
    onClose();
  };

  return (
    <div className="studio-panel-container">
      <div className="studio-panel-header">
        <h2 className="studio-panel-title">Football Graphics</h2>
        <button onClick={onClose} className="studio-panel-close"><X size={20} /></button>
      </div>
      <div className="studio-match-bar">
        <div className="studio-match-team">
          <img src={homeLogo} alt="" className="studio-match-logo" />
          <span className="studio-match-name">{homeName}</span>
        </div>
        <span className="studio-match-score">{homeScore} - {awayScore}</span>
        <div className="studio-match-team">
          <span className="studio-match-name">{awayName}</span>
          <img src={awayLogo} alt="" className="studio-match-logo" />
        </div>
      </div>
      <div className="studio-grid-2">
        <button onClick={addScorebug} className="studio-action-btn"><Tv size={24} /><span>Scorebug</span><span className="studio-action-sub">Broadcast overlay</span></button>
        <button onClick={addFormation} className="studio-action-btn"><Shirt size={24} /><span>4-3-3 Formation</span><span className="studio-action-sub">Home team lineup</span></button>
      </div>
      <div style={{ marginTop: '24px' }}>
        <div className="studio-section-title">Player Card Builder</div>
        <div className="studio-grid-2">
          <button onClick={() => addPlayerCard(homeName, homeLogo, true)} className="studio-action-btn"><User size={24} /><span>{homeName} Card</span><span className="studio-action-sub">Emerald Template</span></button>
          <button onClick={() => addPlayerCard(awayName, awayLogo, false)} className="studio-action-btn"><User size={24} /><span>{awayName} Card</span><span className="studio-action-sub">Red Template</span></button>
        </div>
      </div>
    </div>
  );
}