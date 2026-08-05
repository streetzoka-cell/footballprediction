import React, { useRef, useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Stage, Layer, Rect, Text, Circle, Image as KonvaImage, Transformer } from 'react-konva';
import useImage from 'use-image';
import { useEditorStore } from '../store/editorStore';
import FootballDataPanel from '../components/FootballDataPanel';
import AssetPanel from '../components/AssetPanel';
import { saveProject, saveMediaBlob, getMediaBlob } from '../services/studioService';
import { Trash2, Type, Square, Shirt, Download, Loader, Save, Check, Copy, Layers, Play, Pause, Shapes, Upload, Video, Volume2, Scissors, WifiOff } from 'lucide-react';

// Binary patcher to fix WebM duration metadata for iOS/Android compatibility
const fixWebmDuration = async (blob, durationMs) => {
  if (blob.type !== 'video/webm') return blob;
  const arrayBuffer = await blob.arrayBuffer();
  const uint8 = new Uint8Array(arrayBuffer);
  const view = new DataView(arrayBuffer);
  let segInfoOffset = -1;
  for (let i = 0; i < uint8.length - 4; i++) {
    if (view.getUint32(i) === 0x1549A966) { segInfoOffset = i; break; }
  }
  if (segInfoOffset === -1) return blob;
  let timecodeOffset = -1;
  for (let i = segInfoOffset; i < uint8.length - 3; i++) {
    if (view.getUint8(i) === 0x2A && view.getUint8(i+1) === 0xD7 && view.getUint8(i+2) === 0xB1) { timecodeOffset = i; break; }
  }
  if (timecodeOffset === -1) return blob;
  let timecodeScale = 1000000;
  const tsSize = view.getUint8(timecodeOffset + 3);
  if (tsSize === 3) timecodeScale = (view.getUint8(timecodeOffset + 4) << 16) | (view.getUint8(timecodeOffset + 5) << 8) | view.getUint8(timecodeOffset + 6);
  const durationInMkvUnits = durationMs * (timecodeScale / 1000000);
  const insertAt = timecodeOffset + 7;
  const durationElement = new Uint8Array(2 + 1 + 8);
  const durView = new DataView(durationElement.buffer);
  durView.setUint16(0, 0x4489); durView.setUint8(2, 0x88); durView.setFloat64(3, durationInMkvUnits);
  const segInfoSizeOffset = segInfoOffset + 4;
  const firstByte = view.getUint8(segInfoSizeOffset);
  let sizeBytes = 1, mask = 0x80;
  while (sizeBytes <= 8 && (firstByte & mask) === 0) { mask >>= 1; sizeBytes++; }
  let segInfoSize = (firstByte & (mask - 1));
  for (let i = 1; i < sizeBytes; i++) segInfoSize = (segInfoSize << 8) + view.getUint8(segInfoSizeOffset + i);
  const newSize = segInfoSize + durationElement.length;
  const maxValForWidth = (1 << (7 * sizeBytes - 1)) - 1;
  if (newSize > maxValForWidth) return blob;
  const newUint8 = new Uint8Array(uint8.length + durationElement.length);
  newUint8.set(uint8.subarray(0, insertAt), 0);
  newUint8.set(durationElement, insertAt);
  newUint8.set(uint8.subarray(insertAt), insertAt + durationElement.length);
  const newView = new DataView(newUint8.buffer);
  let patchVal = newSize;
  for (let i = sizeBytes - 1; i >= 1; i--) { newView.setUint8(segInfoSizeOffset + i, patchVal & 0xFF); patchVal >>= 8; }
  newView.setUint8(segInfoSizeOffset, (firstByte & (mask - 1)) | (patchVal & (mask - 1)));
  return new Blob([newUint8], { type: 'video/webm' });
};

const CanvasImage = ({ layer, isSelected, onSelect, onChange }) => {
  const [img] = useImage(layer.src || '', 'anonymous');
  return (
    <KonvaImage 
      image={img} x={layer.x} y={layer.y} width={layer.width} height={layer.height} 
      rotation={layer.rotation || 0} opacity={layer.opacity ?? 1} draggable 
      onClick={onSelect} onTap={onSelect}
      onDragMove={(e) => onChange({ x: e.target.x(), y: e.target.y() })}
      onDragEnd={(e) => onChange({ x: e.target.x(), y: e.target.y() })}
      onTransformEnd={(e) => {
        const node = e.target; const scaleX = node.scaleX(); const scaleY = node.scaleY(); 
        node.scaleX(1); node.scaleY(1);
        onChange({ x: node.x(), y: node.y(), rotation: node.rotation(), width: Math.max(5, node.width() * scaleX), height: Math.max(5, node.height() * scaleY) });
      }}
    />
  );
};

const CanvasVideo = ({ layer, videoRef, onSelect, onChange }) => {
  const imageRef = useRef(null);

  useEffect(() => {
    if (videoRef.current && imageRef.current) imageRef.current.image(videoRef.current);
  }, [videoRef]);

  useEffect(() => {
    let anim;
    const draw = () => {
      if (imageRef.current && videoRef.current) imageRef.current.getLayer().batchDraw();
      anim = requestAnimationFrame(draw);
    };
    anim = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(anim);
  }, []);

  return (
    <KonvaImage 
      ref={imageRef} x={layer.x} y={layer.y} width={layer.width} height={layer.height} 
      rotation={layer.rotation || 0} opacity={layer.opacity ?? 1} draggable 
      onClick={onSelect} onTap={onSelect}
      onDragMove={(e) => onChange({ x: e.target.x(), y: e.target.y() })}
      onDragEnd={(e) => onChange({ x: e.target.x(), y: e.target.y() })}
      onTransformEnd={(e) => {
        const node = e.target; const scaleX = node.scaleX(); const scaleY = node.scaleY(); 
        node.scaleX(1); node.scaleY(1);
        onChange({ x: node.x(), y: node.y(), rotation: node.rotation(), width: Math.max(5, node.width() * scaleX), height: Math.max(5, node.height() * scaleY) });
      }}
    />
  );
};

export default function StudioEditor() {
  const navigate = useNavigate();
  const { project, selectedLayerId, selectLayer, updateLayer, removeLayer, addLayer, isPlaying, setPlaying, currentTime, setCurrentTime, duration, isOffline } = useEditorStore();
  const containerRef = useRef(null);
  const stageRef = useRef(null);
  const transformerRef = useRef(null);
  const layerRefs = useRef(new Map());
  const hiddenVideoRef = useRef(null);
  const hiddenAudioRef = useRef(null);
  
  const [scale, setScale] = useState(1);
  const [showFootballPanel, setShowFootballPanel] = useState(false);
  const [showAssetPanel, setShowAssetPanel] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [saveStatus, setSaveStatus] = useState('idle');

  const videoLayer = project?.layers.find(l => l.type === 'video');
  const audioLayer = project?.layers.find(l => l.type === 'audio');

  useEffect(() => {
    if (!containerRef.current || !project) return;
    const handleResize = () => {
      const cw = containerRef.current.offsetWidth - 48; 
      const ch = containerRef.current.offsetHeight - 250;
      setScale(Math.min(cw / project.canvasSize.width, ch / project.canvasSize.height, 1));
    };
    handleResize(); 
    window.addEventListener('resize', handleResize); 
    return () => window.removeEventListener('resize', handleResize);
  }, [project]);

  useEffect(() => {
    if (selectedLayerId === null || !transformerRef.current) { 
      transformerRef.current?.nodes([]); 
      return; 
    }
    const node = layerRefs.current.get(selectedLayerId);
    if (node) { 
      transformerRef.current.nodes([node]); 
      transformerRef.current.getLayer().batchDraw(); 
    }
  }, [selectedLayerId, project]);

  useEffect(() => {
    if (!project || !project.id) return;
    setSaveStatus('saving');
    const timer = setTimeout(() => { 
      try { 
        saveProject(project); 
        setSaveStatus('saved'); 
        setTimeout(() => setSaveStatus('idle'), 2000); 
      } catch (err) { 
        setSaveStatus('idle'); 
      } 
    }, 1000);
    return () => clearTimeout(timer);
  }, [project]);

  useEffect(() => {
    const video = hiddenVideoRef.current;
    if (!video) return;
    if (videoLayer) {
      video.src = videoLayer.src;
      video.playbackRate = videoLayer.speed || 1;
      video.volume = videoLayer.volume ?? 1;
      video.onloadedmetadata = () => {
        if (video.duration && isFinite(video.duration)) {
          useEditorStore.getState().setDuration(video.duration);
          if (!videoLayer.duration) updateLayer(videoLayer.id, { duration: video.duration });
        }
      };
    } else {
      video.removeAttribute('src'); 
    }
  }, [videoLayer?.src]);

  useEffect(() => {
    const video = hiddenVideoRef.current; const audio = hiddenAudioRef.current;
    if (video && videoLayer) { video.playbackRate = videoLayer.speed || 1; video.volume = videoLayer.volume ?? 1; }
    if (audio && audioLayer) { audio.volume = audioLayer.volume ?? 1; }
  }, [videoLayer?.speed, videoLayer?.volume, audioLayer?.volume]);

  useEffect(() => {
    const audio = hiddenAudioRef.current;
    if (!audio) return;
    if (audioLayer) {
      audio.src = audioLayer.src; audio.loop = true; audio.volume = audioLayer.volume ?? 1;
    } else {
      audio.removeAttribute('src');
    }
  }, [audioLayer?.src]);

  useEffect(() => {
    const video = hiddenVideoRef.current; const audio = hiddenAudioRef.current;
    if (isPlaying) { 
      if (video) { video.currentTime = currentTime + (videoLayer?.trimStart || 0); video.play(); }
      if (audio) { audio.currentTime = currentTime + (audioLayer?.trimStart || 0); audio.play(); }
    } else { 
      video?.pause(); audio?.pause(); 
    }
  }, [isPlaying]);

  // Sync timeline playhead
  useEffect(() => {
    let anim;
    const loop = () => {
      if (isPlaying && videoLayer && hiddenVideoRef.current) {
        const rawTime = hiddenVideoRef.current.currentTime - (videoLayer.trimStart || 0);
        const trimEnd = videoLayer.trimEnd || duration;
        if (rawTime >= trimEnd) {
          setPlaying(false);
          setCurrentTime(0);
        } else {
          setCurrentTime(rawTime);
        }
      }
      anim = requestAnimationFrame(loop);
    };
    anim = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(anim);
  }, [isPlaying, videoLayer, duration]);

  const handleImportMedia = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    const url = URL.createObjectURL(file);
    
    if (file.type.includes('video')) {
      const tempVideo = document.createElement('video');
      tempVideo.src = url;
      tempVideo.onloadedmetadata = async () => {
        const dur = tempVideo.duration;
        addLayer({ type: 'video', src: url, x: 0, y: 0, width: project.canvasSize.width, height: project.canvasSize.height, speed: 1, volume: 1, trimStart: 0, trimEnd: dur, duration: dur });
        await saveMediaBlob(project.id + '_video', file);
      };
    } else if (file.type.includes('image')) {
      addLayer({ type: 'image', src: url, x: 200, y: 300, width: 680, height: 600 });
      await saveMediaBlob(project.id + '_img_' + Date.now(), file);
    } else if (file.type.includes('audio')) {
      addLayer({ type: 'audio', src: url, name: file.name, volume: 1, trimStart: 0 });
      await saveMediaBlob(project.id + '_audio', file);
    }
  };

  const handleExportVideo = async () => {
    if (!stageRef.current || isExporting) return; 
    setIsExporting(true); setExportProgress(0); selectLayer(null); setPlaying(false);
    
    await new Promise(r => setTimeout(r, 200));

    const canvas = stageRef.current.toCanvas({ pixelRatio: 2 });
    const stream = canvas.captureStream(30);
    const videoNode = hiddenVideoRef.current;
    const audioNode = hiddenAudioRef.current;
    
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const dest = audioCtx.createMediaStreamDestination();

    if (videoNode && videoLayer) {
      try {
        const vStream = videoNode.captureStream ? videoNode.captureStream() : videoNode.mozCaptureStream();
        const vSource = audioCtx.createMediaStreamSource(vStream);
        vSource.connect(dest);
      } catch(e) {}
    }
    if (audioNode && audioLayer) {
      try {
        const aStream = audioNode.captureStream ? audioNode.captureStream() : audioNode.mozCaptureStream();
        const aSource = audioCtx.createMediaStreamSource(aStream);
        aSource.connect(dest);
      } catch(e) {}
    }
    
    dest.stream.getAudioTracks().forEach(t => stream.addTrack(t));

    let mimeType = 'video/webm;codecs=vp9';
    if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = 'video/webm;codecs=vp8';
    if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = 'video/webm';

    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8000000 }); 
    const chunks = [];
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
    
    recorder.onstop = async () => {
      const rawBlob = new Blob(chunks, { type: mimeType });
      const exportDuration = (videoLayer?.trimEnd || duration) - (videoLayer?.trimStart || 0);
      const fixedBlob = await fixWebmDuration(rawBlob, exportDuration * 1000);
      
      const url = URL.createObjectURL(fixedBlob);
      const a = document.createElement('a'); 
      a.href = url; 
      a.download = `${project.name.replace(/\s+/g, '_')}_zokascore.webm`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a); 
      setIsExporting(false);
      setExportProgress(100);
      audioCtx.close();
    };

    recorder.start(100); 
    
    if (videoNode) {
      videoNode.currentTime = videoLayer?.trimStart || 0;
      videoNode.play();
    }
    if (audioNode) {
      audioNode.currentTime = audioLayer?.trimStart || 0;
      audioNode.play();
    }
    setPlaying(true);

    const exportDur = (videoLayer?.trimEnd || duration) - (videoLayer?.trimStart || 0);
    const startTime = Date.now();
    const progInterval = setInterval(() => {
      const elapsed = (Date.now() - startTime) / 1000;
      setExportProgress(Math.min(99, (elapsed / exportDur) * 100));
    }, 200);

    setTimeout(() => { 
      recorder.stop(); 
      setPlaying(false); 
      videoNode?.pause(); 
      audioNode?.pause();
      clearInterval(progInterval);
    }, exportDur * 1000);
  };

  const handleExportPNG = () => {
    if (!stageRef.current || isExporting) return; 
    setIsExporting(true); selectLayer(null);
    setTimeout(() => {
      const dataURL = stageRef.current.toDataURL({ pixelRatio: 2, mimeType: 'image/png' });
      const link = document.createElement('a'); link.href = dataURL; link.download = `${project.name.replace(/\s+/g, '_')}_zokascore.png`;
      document.body.appendChild(link); link.click(); document.body.removeChild(link); setIsExporting(false);
    }, 100);
  };

  const handleDuplicate = (layer) => { const newLayer = { ...layer, x: layer.x + 20, y: layer.y + 20 }; delete newLayer.id; addLayer(newLayer); };
  
  const handleTimelineScrub = (e) => {
    const t = parseFloat(e.target.value);
    setCurrentTime(t);
    if (hiddenVideoRef.current && videoLayer) hiddenVideoRef.current.currentTime = t + (videoLayer.trimStart || 0);
    if (hiddenAudioRef.current && audioLayer) hiddenAudioRef.current.currentTime = t + (audioLayer.trimStart || 0);
  };

  if (!project) {
    return (
      <div className="zs-empty-state zs-empty-state-full">
        <p>No project loaded.</p>
        <button className="zs-btn-primary" onClick={() => navigate('/studio')}>Go to Studio Home</button>
      </div>
    );
  }

  const selectedLayer = project.layers.find(l => l.id === selectedLayerId);

  return (
    <div className="zs-editor-container">
      <video ref={hiddenVideoRef} className="zs-hidden-media" playsInline />
      <audio ref={hiddenAudioRef} className="zs-hidden-media" />

      <div className="zs-editor-header">
        <div className="zs-header-left">
          <button className="zs-btn-ghost" onClick={() => navigate('/studio')}>← Back</button>
          <div className={`zs-save-status ${saveStatus === 'saving' ? 'saving' : 'saved'}`}>
            {saveStatus === 'saving' ? <Save size={12} /> : <Check size={12} />} 
            {saveStatus === 'saving' ? 'Saving...' : 'Saved'}
          </div>
          {isOffline && <div className="zs-offline-badge"><WifiOff size={12} /> Offline</div>}
        </div>
        <span className="zs-project-name-header">{project.name}</span>
        <div className="zs-header-right">
          {videoLayer && (
            <button className="zs-btn-danger" onClick={handleExportVideo} disabled={isExporting}>
              {isExporting ? <><Loader size={14} className="zs-spin" /> {Math.round(exportProgress)}%</> : <><Video size={14} /> Export Video</>}
            </button>
          )}
          <button className="zs-btn-primary" onClick={handleExportPNG} disabled={isExporting}>
            <Download size={14} /> PNG
          </button>
        </div>
      </div>

      <div ref={containerRef} className="zs-canvas-area">
        <div className="zs-canvas-wrap">
          <Stage 
            ref={stageRef} 
            width={project.canvasSize.width * scale} 
            height={project.canvasSize.height * scale} 
            scaleX={scale} scaleY={scale} 
            onMouseDown={(e) => { if (e.target === e.target.getStage()) selectLayer(null); }}
          >
            <Layer>
              <Rect width={project.canvasSize.width} height={project.canvasSize.height} fill="#0f172a" />
              {project.layers.map((layer) => {
                if (layer.type === 'audio') return null;
                const commonProps = {
                  isSelected: layer.id === selectedLayerId,
                  onSelect: () => selectLayer(layer.id),
                  onChange: (newAttrs) => updateLayer(layer.id, newAttrs),
                  ref: (node) => { if (node) layerRefs.current.set(layer.id, node); else layerRefs.current.delete(layer.id); }
                };
                
                if (layer.type === 'rect') {
                  let fillProp = layer.fill;
                  if (layer.isGradient && typeof layer.fill === 'string' && layer.fill.includes('linear-gradient')) {
                    const colors = layer.fill.match(/#[a-f0-9]{6}/gi);
                    if (colors && colors.length >= 2) {
                      fillProp = {
                        fillLinearGradientStartPoint: { x: 0, y: 0 },
                        fillLinearGradientEndPoint: { x: layer.width, y: layer.height },
                        fillLinearGradientColorStops: [0, colors[0], 1, colors[1]]
                      };
                    }
                  }
                  return <Rect key={layer.id} {...commonProps} x={layer.x} y={layer.y} width={layer.width} height={layer.height} fill={fillProp} cornerRadius={layer.cornerRadius || 0} rotation={layer.rotation || 0} opacity={layer.opacity ?? 1} draggable onDragMove={(e) => commonProps.onChange({x: e.target.x(), y: e.target.y()})} />;
                }

                if (layer.type === 'text') return <Text key={layer.id} {...commonProps} text={layer.text} x={layer.x} y={layer.y} fontSize={layer.fontSize} fill={layer.fill} fontStyle={layer.fontStyle} fontFamily={layer.fontFamily || 'Inter, sans-serif'} rotation={layer.rotation || 0} opacity={layer.opacity ?? 1} align={layer.align || 'left'} width={layer.width || undefined} draggable onDragMove={(e) => commonProps.onChange({x: e.target.x(), y: e.target.y()})} />;
                if (layer.type === 'image') return <CanvasImage key={layer.id} layer={layer} {...commonProps} />;
                if (layer.type === 'video') return <CanvasVideo key={layer.id} layer={layer} videoRef={hiddenVideoRef} onSelect={commonProps.onSelect} onChange={commonProps.onChange} />;
                if (layer.type === 'circle') return <Circle key={layer.id} {...commonProps} x={layer.x} y={layer.y} radius={layer.radius} fill={layer.fill} opacity={layer.opacity ?? 1} draggable onDragMove={(e) => commonProps.onChange({x: e.target.x(), y: e.target.y()})} />;
                return null;
              })}
              <Transformer ref={transformerRef} borderStroke="var(--zs-accent)" anchorStroke="var(--zs-accent)" anchorCornerRadius={6} anchorSize={8} rotateEnabled={true} enabledAnchors={['top-left', 'top-right', 'bottom-left', 'bottom-right']} />
            </Layer>
          </Stage>
        </div>
      </div>

      {videoLayer && (
        <div className="zs-timeline">
          <button className="zs-btn-icon" onClick={() => setPlaying(!isPlaying)}>
            {isPlaying ? <Pause size={16} /> : <Play size={16} fill="#fff" />}
          </button>
          <input type="range" min="0" max={duration || 10} step="0.1" value={currentTime} onChange={handleTimelineScrub} className="zs-range" />
          <span className="zs-time-display">{currentTime.toFixed(1)}s / {duration.toFixed(1)}s</span>
        </div>
      )}

      <div className="zs-layer-bar">
        <Layers size={16} color="var(--zs-text-muted)" />
        {project.layers.map(layer => (
          <div key={layer.id} onClick={() => selectLayer(layer.id)} className={`zs-layer-chip ${selectedLayerId === layer.id ? 'active' : ''}`}>
            {layer.type === 'text' && <Type size={10} />} {layer.type === 'rect' && <Square size={10} />} {layer.type === 'image' && '🖼️'} {layer.type === 'video' && '🎥'} {layer.type === 'audio' && '🎵'} {layer.type === 'circle' && '⭕'}
            {layer.type === 'text' ? layer.text.substring(0, 10) : layer.type}
          </div>
        ))}
      </div>

      {selectedLayer && (
        <div className="zs-properties-panel">
          <div className="zs-panel-header">
            <span className="zs-panel-title">Edit {selectedLayer.type}</span>
            <div className="zs-panel-actions">
              <button className="zs-btn-text zs-text-blue" onClick={() => handleDuplicate(selectedLayer)}><Copy size={14} /> Duplicate</button>
              <button className="zs-btn-text zs-text-danger" onClick={() => removeLayer(selectedLayer.id)}><Trash2 size={14} /> Delete</button>
            </div>
          </div>
          
          <div className="zs-panel-controls">
            {selectedLayer.type === 'text' && (
              <>
                <input type="text" value={selectedLayer.text} onChange={(e) => updateLayer(selectedLayer.id, { text: e.target.value })} className="zs-input" placeholder="Caption..." />
                <input type="number" value={selectedLayer.fontSize} onChange={(e) => updateLayer(selectedLayer.id, { fontSize: parseInt(e.target.value) || 12 })} className="zs-input zs-input-sm" />
                <select value={selectedLayer.fontFamily || 'Inter, sans-serif'} onChange={(e) => updateLayer(selectedLayer.id, { fontFamily: e.target.value })} className="zs-select">
                  <option value="Inter, sans-serif">Inter</option><option value="Arial, sans-serif">Arial</option><option value="Impact, sans-serif">Impact</option>
                </select>
                <input type="color" value={selectedLayer.fill} onChange={(e) => updateLayer(selectedLayer.id, { fill: e.target.value })} className="zs-color-input" />
              </>
            )}
            {selectedLayer.type === 'video' && (
              <>
                <div className="zs-control-row">
                  <div className="zs-control-group">
                    <Scissors size={14} color="var(--zs-text-muted)" />
                    <span className="zs-label">Speed</span>
                    <select value={selectedLayer.speed || 1} onChange={(e) => updateLayer(selectedLayer.id, { speed: parseFloat(e.target.value) })} className="zs-select">
                      <option value="0.5">0.5x</option><option value="1">1x</option><option value="2">2x</option>
                    </select>
                  </div>
                  <div className="zs-control-group zs-flex-1">
                    <Volume2 size={14} color="var(--zs-text-muted)" />
                    <input type="range" min="0" max="1" step="0.1" value={selectedLayer.volume ?? 1} onChange={(e) => updateLayer(selectedLayer.id, { volume: parseFloat(e.target.value) })} className="zs-range" />
                  </div>
                </div>
                <div className="zs-control-row" style={{marginTop: '12px'}}>
                  <div className="zs-control-group zs-flex-1">
                    <span className="zs-label">Trim Start: {selectedLayer.trimStart?.toFixed(1) || 0}s</span>
                    <input type="range" min="0" max={duration} step="0.1" value={selectedLayer.trimStart || 0} onChange={(e) => updateLayer(selectedLayer.id, { trimStart: parseFloat(e.target.value) })} className="zs-range" />
                  </div>
                  <div className="zs-control-group zs-flex-1">
                    <span className="zs-label">Trim End: {selectedLayer.trimEnd?.toFixed(1) || duration}s</span>
                    <input type="range" min="0" max={duration} step="0.1" value={selectedLayer.trimEnd || duration} onChange={(e) => updateLayer(selectedLayer.id, { trimEnd: parseFloat(e.target.value) })} className="zs-range" />
                  </div>
                </div>
              </>
            )}
            {selectedLayer.type === 'audio' && (
              <div className="zs-control-row">
                <Volume2 size={14} color="var(--zs-text-muted)" />
                <span className="zs-audio-name">{selectedLayer.name}</span>
                <input type="range" min="0" max="1" step="0.1" value={selectedLayer.volume ?? 1} onChange={(e) => updateLayer(selectedLayer.id, { volume: parseFloat(e.target.value) })} className="zs-range zs-flex-1" />
              </div>
            )}
          </div>
        </div>
      )}

      {!selectedLayer && !showFootballPanel && !showAssetPanel && (
        <div className="zs-fab-container">
          <label className="zs-fab zs-fab-purple">
            <Upload size={24} /><input type="file" accept="video/*,image/*,audio/*" onChange={handleImportMedia} className="zs-hidden-file" />
          </label>
          <button className="zs-fab zs-fab-blue" onClick={() => setShowFootballPanel(true)}><Shirt size={24} /></button>
          <button className="zs-fab zs-fab-gold" onClick={() => setShowAssetPanel(true)}><Shapes size={24} /></button>
          <button className="zs-fab" onClick={() => addLayer({ type: 'text', text: 'Caption', x: 400, y: 800, fontSize: 60, fill: '#ffffff', fontStyle: 'bold', fontFamily: 'Inter, sans-serif' })}><Type size={24} /></button>
        </div>
      )}

      {showFootballPanel && <div className="zs-overlay-panel"><FootballDataPanel onClose={() => setShowFootballPanel(false)} /></div>}
      {showAssetPanel && <div className="zs-overlay-panel"><AssetPanel onClose={() => setShowAssetPanel(false)} /></div>}
    </div>
  );
}