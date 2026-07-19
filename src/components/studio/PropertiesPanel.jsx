import React, { useState } from 'react';
import { Sparkles, Type, Data, Palette } from 'lucide-react';

export default function PropertiesPanel() {
  const [caption, setCaption] = useState("Waiting for AI...");
  const [loading, setLoading] = useState(false);

  const generateCaption = async () => {
    setLoading(true);
    try {
      // Call your existing Node.js backend
      const res = await fetch('/api/ai/generate-caption', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          match: "Chelsea vs PSG", 
          score: "2-1", 
          context: "FIFA Club World Cup Final" 
        })
      });
      const data = await res.json();
      setCaption(data.caption);
    } catch (error) {
      setCaption("Error generating caption.");
    }
    setLoading(false);
  };

  return (
    <div className="properties-container">
      {/* Tab Header */}
      <div className="tab-header">
        <button className="tab-btn active"><Type size={16} /> Text</button>
        <button className="tab-btn"><Data size={16} /> Data</button>
        <button className="tab-btn"><Palette size={16} /> Style</button>
      </div>

      {/* AI Section */}
      <div className="ai-section glass-subpanel">
        <h3>AI Assistant</h3>
        <button 
          className="ai-btn" 
          onClick={generateCaption}
          disabled={loading}
        >
          <Sparkles size={16} /> {loading ? 'Generating...' : 'Generate Caption'}
        </button>
        <div className="ai-output">{caption}</div>
      </div>

      {/* Text Controls */}
      <div className="text-controls">
        <h3>Text Properties</h3>
        <label>Font Family</label>
        <select className="studio-input">
          <option>Inter</option>
          <option>Roboto</option>
          <option>Bebas Neue</option>
        </select>

        <label>Color</label>
        <input type="color" defaultValue="#ffffff" className="color-picker" />

        <label>Animation</label>
        <select className="studio-input">
          <option>None</option>
          <option>Fade In</option>
          <option>Typewriter</option>
          <option>Slide Up</option>
          <option>Glitch</option>
        </select>
      </div>
    </div>
  );
}