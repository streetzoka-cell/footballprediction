import React, { useReducer, useRef, useEffect, useCallback, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { 
  ArrowLeft, Download, Monitor, Camera, Mic, MicOff, Volume2, Square, Circle, 
  Trash2, Move, AppWindow, Palette, Settings, X, Layers, Crop, Sliders, Check, AlertTriangle, Info
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════
// HELPER: WebM Duration Metadata Fixer
// ═══════════════════════════════════════════════════════════
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
    if (view.getUint8(i) === 0x2A && view.getUint8(i + 1) === 0xD7 && view.getUint8(i + 2) === 0xB1) { timecodeOffset = i; break; }
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

// ═══════════════════════════════════════════════════════════
// CONFIG & PRESETS
// ═══════════════════════════════════════════════════════════
const ASPECT_RATIOS = [
  { id: '16:9', name: 'YT (16:9)' },
  { id: '9:16', name: 'Shorts (9:16)' },
  { id: '1:1', name: 'Square (1:1)' },
  { id: '4:3', name: 'Classic (4:3)' }
];

const CAMERA_FRAMES = [
  { id: 'circle', name: 'Circle' }, { id: 'rounded', name: 'Rounded' },
  { id: 'square', name: 'Square' }, { id: 'neon', name: 'Neon Glow' },
  { id: 'minimal', name: 'Minimal' }
];

const SCREEN_FIT_MODES = [
  { id: 'cover', name: 'Cover (Crop)' }, { id: 'contain', name: 'Contain (Letterbox)' }
];

const FILTERS = [
  { id: 'none', name: 'Normal' }, { id: 'brightness(1.2) contrast(1.1)', name: 'Enhance' },
  { id: 'grayscale(1)', name: 'B&W' }, { id: 'sepia(0.8)', name: 'Sepia' },
  { id: 'saturate(2)', name: 'Vivid' }, { id: 'hue-rotate(90deg)', name: 'Cyber' }
];

// ═══════════════════════════════════════════════════════════
// STATE MANAGEMENT
// ═══════════════════════════════════════════════════════════
const initialState = {
  settings: {
    aspectRatio: '16:9', cameraFrame: 'circle', screenFit: 'cover', screenFilter: 'none', webcamFilter: 'none',
    bgColor: '#0a0f1a', bgBlur: true, micVolume: 100, webcamSize: 250, webcamPos: { x: 50, y: 50 }
  },
  media: { screenReady: false, webcamOn: false, micOn: false },
  exportData: { recordedUrl: null, exportExt: 'webm', isRecording: false }
};

function studioReducer(state, action) {
  switch (action.type) {
    case 'SET_SETTINGS': return { ...state, settings: { ...state.settings, ...action.payload } };
    case 'SET_MEDIA': return { ...state, media: { ...state.media, ...action.payload } };
    case 'SET_EXPORT': return { ...state, exportData: { ...state.exportData, ...action.payload } };
    default: return state;
  }
}

// ═══════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════
export default function WebShowcaseStudio() {
  const navigate = useNavigate();
  const [state, dispatch] = useReducer(studioReducer, initialState);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [showMobileSettings, setShowMobileSettings] = useState(false);
  const [toast, setToast] = useState(null);

  const canvasRef = useRef(null);
  const screenVideoRef = useRef(null);
  const webcamVideoRef = useRef(null);
  
  const screenStreamRef = useRef(null);
  const webcamStreamRef = useRef(null);
  const micStreamRef = useRef(null); 
  const mixedStreamRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const dragRef = useRef({ active: false, mode: null, offsetX: 0, offsetY: 0 });
  const recordStartRef = useRef(0);
  const audioCtxRef = useRef(null);
  const micGainRef = useRef(null);

  const { settings, media, exportData } = state;
  const activeRatio = ASPECT_RATIOS.find(r => r.id === settings.aspectRatio);

  const showToast = (msg, type = 'info') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      stopStreams();
      if (audioCtxRef.current) audioCtxRef.current.close();
    };
  }, []);

  const stopStreams = () => {
    if (screenStreamRef.current) screenStreamRef.current.getTracks().forEach(t => t.stop());
    if (webcamStreamRef.current) webcamStreamRef.current.getTracks().forEach(t => t.stop());
    if (micStreamRef.current) micStreamRef.current.getTracks().forEach(t => t.stop());
    if (mixedStreamRef.current) mixedStreamRef.current.getTracks().forEach(t => t.stop());
  };

  const startScreenShare = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: { cursor: "always" }, audio: true });
      screenStreamRef.current = stream;
      if (screenVideoRef.current) {
        screenVideoRef.current.srcObject = stream;
        screenVideoRef.current.muted = true; 
        screenVideoRef.current.play().catch(e => console.error("Play error:", e));
      }
      dispatch({ type: 'SET_MEDIA', payload: { screenReady: true } });

      stream.getVideoTracks()[0].onended = () => {
        dispatch({ type: 'SET_MEDIA', payload: { screenReady: false } });
        if (screenVideoRef.current) screenVideoRef.current.srcObject = null;
        screenStreamRef.current = null;
      };
      showToast('Screen share started', 'success');
    } catch (err) {
      showToast('Screen share canceled', 'error');
    }
  };

  const toggleWebcam = async () => {
    if (media.webcamOn) {
      if (webcamStreamRef.current) webcamStreamRef.current.getTracks().forEach(t => t.stop());
      webcamStreamRef.current = null;
      if (webcamVideoRef.current) webcamVideoRef.current.srcObject = null;
      dispatch({ type: 'SET_MEDIA', payload: { webcamOn: false } });
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720, facingMode: 'user' } });
        webcamStreamRef.current = stream;
        if (webcamVideoRef.current) {
          webcamVideoRef.current.srcObject = stream;
          webcamVideoRef.current.play();
        }
        dispatch({ type: 'SET_MEDIA', payload: { webcamOn: true } });
        showToast('Webcam activated', 'success');
      } catch (err) {
        showToast('Webcam access denied', 'error');
      }
    }
  };

  const toggleMic = async () => {
    if (media.micOn) {
      if (micStreamRef.current) micStreamRef.current.getTracks().forEach(t => t.stop());
      micStreamRef.current = null;
      dispatch({ type: 'SET_MEDIA', payload: { micOn: false } });
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        micStreamRef.current = stream;
        dispatch({ type: 'SET_MEDIA', payload: { micOn: true } });
        showToast('Microphone activated', 'success');
      } catch (err) {
        showToast('Microphone access denied', 'error');
      }
    }
  };

  // ═══════════════════════════════════════════════════════════
  // CANVAS RENDERING ENGINE
  // ═══════════════════════════════════════════════════════════
  const drawFrameRef = useRef(() => {});
  
  drawFrameRef.current = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;
    
    const dims = { '16:9': {w:1280,h:720}, '9:16': {w:720,h:1280}, '1:1': {w:1080,h:1080}, '4:3': {w:1024,h:768} };
    const dim = dims[settings.aspectRatio] || dims['16:9'];
    if (canvas.width !== dim.w) canvas.width = dim.w;
    if (canvas.height !== dim.h) canvas.height = dim.h;

    // Background
    if (settings.bgBlur && screenVideoRef.current && screenVideoRef.current.videoWidth > 0 && settings.screenFit === 'contain') {
      ctx.filter = 'blur(40px) brightness(0.5)';
      ctx.drawImage(screenVideoRef.current, 0, 0, canvas.width, canvas.height);
      ctx.filter = 'none';
    } else {
      ctx.fillStyle = settings.bgColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // Screen Share
    const screenVid = screenVideoRef.current;
    if (media.screenReady && screenVid && screenVid.videoWidth > 0) {
      ctx.save();
      ctx.filter = settings.screenFilter;
      
      const vidW = screenVid.videoWidth;
      const vidH = screenVid.videoHeight;
      const canvasRatio = canvas.width / canvas.height;
      const vidRatio = vidW / vidH;
      
      let sx, sy, sw, sh;
      if (settings.screenFit === 'cover') {
        if (vidRatio > canvasRatio) { sw = vidH * canvasRatio; sh = vidH; sx = (vidW - sw) / 2; sy = 0; }
        else { sw = vidW; sh = vidW / canvasRatio; sx = 0; sy = (vidH - sh) / 2; }
      } else { // contain
        if (vidRatio > canvasRatio) { sw = vidW; sh = vidW / canvasRatio; sx = 0; sy = (vidH - sh) / 2; }
        else { sh = vidH; sw = vidH * canvasRatio; sx = (vidW - sw) / 2; sy = 0; }
      }
      ctx.drawImage(screenVid, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
      ctx.restore();
    }

    // Webcam
    const webcamVid = webcamVideoRef.current;
    if (media.webcamOn && webcamVid && webcamVid.videoWidth > 0) {
      const size = settings.webcamSize;
      const x = settings.webcamPos.x;
      const y = settings.webcamPos.y;
      
      ctx.save();
      ctx.filter = settings.webcamFilter;
      
      // Draw Frame/Border
      if (settings.cameraFrame === 'neon') {
        ctx.shadowColor = '#3b82f6'; ctx.shadowBlur = 20; ctx.strokeStyle = '#3b82f6'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(x + size/2, y + size/2, size/2, 0, Math.PI * 2); ctx.closePath(); ctx.stroke();
        ctx.shadowBlur = 0;
      }
      
      // Clip and draw webcam
      ctx.save();
      if (settings.cameraFrame === 'circle' || settings.cameraFrame === 'neon') {
        ctx.beginPath(); ctx.arc(x + size/2, y + size/2, size/2 - (settings.cameraFrame === 'neon' ? 4 : 0), 0, Math.PI * 2); ctx.closePath(); ctx.clip();
      } else if (settings.cameraFrame === 'rounded') {
        const r = 24; ctx.beginPath();
        ctx.moveTo(x + r, y); ctx.arcTo(x + size, y, x + size, y + size, r); ctx.arcTo(x + size, y + size, x, y + size, r);
        ctx.arcTo(x, y + size, x, y, r); ctx.arcTo(x, y, x + size, y, r); ctx.closePath(); ctx.clip();
      } else if (settings.cameraFrame === 'square') {
        ctx.rect(x, y, size, size); ctx.clip();
      }
      
      // Mirror webcam
      ctx.scale(-1, 1); ctx.translate(-(x + size), 0);
      ctx.drawImage(webcamVid, x, y, size, size);
      ctx.restore();

      // Minimal Border
      if (settings.cameraFrame === 'minimal' || settings.cameraFrame === 'rounded') {
        ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.lineWidth = 4;
        if (settings.cameraFrame === 'minimal') {
           ctx.beginPath(); ctx.arc(x + size/2, y + size/2, size/2, 0, Math.PI * 2); ctx.stroke();
        } else {
           const r = 24; ctx.beginPath();
           ctx.moveTo(x + r, y); ctx.arcTo(x + size, y, x + size, y + size, r); ctx.arcTo(x + size, y + size, x, y + size, r);
           ctx.arcTo(x, y + size, x, y, r); ctx.arcTo(x, y, x + size, y, r); ctx.closePath(); ctx.stroke();
        }
      }
      ctx.restore();

      // Resize Handle
      if (!exportData.isRecording) {
        ctx.beginPath(); ctx.arc(x + size, y + size, 16, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)'; ctx.fill();
        ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.stroke();
      }
    }
  };

  useEffect(() => {
    let animFrame;
    const loop = () => { drawFrameRef.current(); animFrame = requestAnimationFrame(loop); };
    animFrame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animFrame);
  }, [state]);

  // ═══════════════════════════════════════════════════════════
  // POINTER & DRAG LOGIC
  // ═══════════════════════════════════════════════════════════
  const getCanvasCoords = (e) => {
    const canvas = canvasRef.current; if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width; const scaleY = canvas.height / rect.height;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
  };

  const handlePointerDown = (e) => {
    if (!media.webcamOn || exportData.isRecording) return;
    const { x, y } = getCanvasCoords(e);
    const handleX = settings.webcamPos.x + settings.webcamSize;
    const handleY = settings.webcamPos.y + settings.webcamSize;

    if (Math.hypot(x - handleX, y - handleY) < 30) {
      dragRef.current = { active: true, mode: 'resize' }; return;
    }
    if (x >= settings.webcamPos.x && x <= settings.webcamPos.x + settings.webcamSize && y >= settings.webcamPos.y && y <= settings.webcamPos.y + settings.webcamSize) {
      dragRef.current = { active: true, mode: 'move', offsetX: x - settings.webcamPos.x, offsetY: y - settings.webcamPos.y };
    }
  };

  const handlePointerMove = (e) => {
    if (!dragRef.current.active) return;
    e.preventDefault();
    const { x, y } = getCanvasCoords(e);
    if (dragRef.current.mode === 'resize') {
      let newSize = Math.max(x - settings.webcamPos.x, y - settings.webcamPos.y);
      newSize = Math.max(80, Math.min(newSize, 600));
      dispatch({ type: 'SET_SETTINGS', payload: { webcamSize: newSize } });
    } else if (dragRef.current.mode === 'move') {
      let newX = Math.max(0, Math.min(x - dragRef.current.offsetX, activeRatio.w - settings.webcamSize));
      let newY = Math.max(0, Math.min(y - dragRef.current.offsetY, activeRatio.h - settings.webcamSize));
      dispatch({ type: 'SET_SETTINGS', payload: { webcamPos: { x: newX, y: newY } } });
    }
  };

  const handlePointerUp = () => dragRef.current.active = false;

  // ═══════════════════════════════════════════════════════════
  // RECORDING ENGINE
  // ═══════════════════════════════════════════════════════════
  useEffect(() => {
    let interval;
    if (exportData.isRecording) {
      recordStartRef.current = Date.now();
      interval = setInterval(() => setElapsedTime(Math.floor((Date.now() - recordStartRef.current) / 1000)), 1000);
    } else { setElapsedTime(0); }
    return () => clearInterval(interval);
  }, [exportData.isRecording]);

  const startRecording = async () => {
    if (!media.screenReady || !canvasRef.current) { showToast('Start screen share first', 'error'); return; }

    const canvasStream = canvasRef.current.captureStream(30);
    mixedStreamRef.current = new MediaStream();
    canvasStream.getVideoTracks().forEach(t => mixedStreamRef.current.addTrack(t));

    try {
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtxRef.current.state === 'suspended') await audioCtxRef.current.resume();
      const audioDest = audioCtxRef.current.createMediaStreamDestination();
      
      // Tab Audio
      if (screenStreamRef.current && screenStreamRef.current.getAudioTracks().length > 0) {
        const src = audioCtxRef.current.createMediaStreamSource(new MediaStream(screenStreamRef.current.getAudioTracks()));
        src.connect(audioDest);
      }
      
      // Mic Audio with Gain Control
      if (micStreamRef.current && micStreamRef.current.getAudioTracks().length > 0) {
        const src = audioCtxRef.current.createMediaStreamSource(new MediaStream(micStreamRef.current.getAudioTracks()));
        micGainRef.current = audioCtxRef.current.createGain();
        micGainRef.current.gain.value = settings.micVolume / 100;
        src.connect(micGainRef.current);
        micGainRef.current.connect(audioDest);
      }

      const osc = audioCtxRef.current.createOscillator();
      const gain = audioCtxRef.current.createGain();
      gain.gain.value = 0.0; osc.connect(gain); gain.connect(audioDest); gain.connect(audioCtxRef.current.destination); osc.start();
      audioDest.stream.getAudioTracks().forEach(t => mixedStreamRef.current.addTrack(t));
    } catch(e) { console.warn("Audio mix failed", e); }

    chunksRef.current = [];
    let mimeType = 'video/webm'; let ext = 'webm';
    if (MediaRecorder.isTypeSupported('video/mp4;codecs=h264')) { mimeType = 'video/mp4'; ext = 'mp4'; }
    else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) { mimeType = 'video/webm;codecs=vp9'; }
    else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8')) { mimeType = 'video/webm;codecs=vp8'; }

    dispatch({ type: 'SET_EXPORT', payload: { exportExt: ext } });

    const recorder = new MediaRecorder(mixedStreamRef.current, { mimeType, videoBitsPerSecond: 8000000 });
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    recorder.onstop = async () => {
      const rawBlob = new Blob(chunksRef.current, { type: mimeType });
      const durationMs = Date.now() - recordStartRef.current;
      const fixedBlob = await fixWebmDuration(rawBlob, durationMs);
      dispatch({ type: 'SET_EXPORT', payload: { recordedUrl: URL.createObjectURL(fixedBlob), isRecording: false } });
      showToast('Export complete!', 'success');
    };

    recorder.start(100);
    recorderRef.current = recorder;
    dispatch({ type: 'SET_EXPORT', payload: { isRecording: true, recordedUrl: null } });
  };

  const stopRecording = () => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop();
  };

  const discardRecording = () => {
    if (exportData.recordedUrl) { URL.revokeObjectURL(exportData.recordedUrl); dispatch({ type: 'SET_EXPORT', payload: { recordedUrl: null } }); }
  };

  const formatTime = (s) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

  // ═══════════════════════════════════════════════════════════
  // UI RENDER
  // ═══════════════════════════════════════════════════════════
  const renderSettings = () => (
    <>
      <div className="wss-panel">
        <div className="wss-panel-title"><Crop size={14} /> Aspect Ratio</div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {ASPECT_RATIOS.map(r => (
            <button key={r.id} onClick={() => dispatch({ type: 'SET_SETTINGS', payload: { aspectRatio: r.id } })} 
              className="wss-btn" 
              style={{ flex: 1, background: settings.aspectRatio === r.id ? 'var(--wss-accent)' : undefined, borderColor: settings.aspectRatio === r.id ? 'var(--wss-accent)' : undefined, justifyContent: 'center' }}>
              {r.name}
            </button>
          ))}
        </div>
      </div>

      <div className="wss-panel">
        <div className="wss-panel-title"><Monitor size={14} /> Screen Fit</div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {SCREEN_FIT_MODES.map(m => (
            <button key={m.id} onClick={() => dispatch({ type: 'SET_SETTINGS', payload: { screenFit: m.id } })} 
              className="wss-btn" 
              style={{ flex: 1, background: settings.screenFit === m.id ? 'var(--wss-accent)' : undefined, borderColor: settings.screenFit === m.id ? 'var(--wss-accent)' : undefined, justifyContent: 'center' }}>
              {m.name}
            </button>
          ))}
        </div>
      </div>

      <div className="wss-panel">
        <div className="wss-panel-title"><Palette size={14} /> Background</div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
          <input type="color" value={settings.bgColor} onChange={(e) => dispatch({ type: 'SET_SETTINGS', payload: { bgColor: e.target.value } })} className="wss-input-color" />
          <input type="text" value={settings.bgColor} onChange={(e) => dispatch({ type: 'SET_SETTINGS', payload: { bgColor: e.target.value } })} className="wss-input" />
        </div>
        <button onClick={() => dispatch({ type: 'SET_SETTINGS', payload: { bgBlur: !settings.bgBlur } })} className="wss-btn" style={{ width: '100%', background: settings.bgBlur ? 'var(--wss-accent)' : undefined, borderColor: settings.bgBlur ? 'var(--wss-accent)' : undefined, justifyContent: 'center' }}>
          Blur BG: {settings.bgBlur ? 'On' : 'Off'}
        </button>
        <span className="wss-hint">Shown if website doesn't fill screen.</span>
      </div>

      <div className="wss-panel">
        <div className="wss-panel-title"><Sliders size={14} /> Screen Filter</div>
        <div className="rs-filters-scroll" style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
          {FILTERS.map(f => <button key={f.id} onClick={() => dispatch({ type: 'SET_SETTINGS', payload: { screenFilter: f.id } })} className="wss-btn" style={{ background: settings.screenFilter === f.id ? 'var(--wss-accent)' : undefined, borderColor: settings.screenFilter === f.id ? 'var(--wss-accent)' : undefined, justifyContent: 'center' }}>{f.name}</button>)}
        </div>
      </div>

      {media.webcamOn && (
        <div className="wss-panel">
          <div className="wss-panel-title"><Camera size={14} /> Webcam Shape & Filter</div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
            {CAMERA_FRAMES.map(f => <button key={f.id} onClick={() => dispatch({ type: 'SET_SETTINGS', payload: { cameraFrame: f.id } })} className="wss-btn" style={{ background: settings.cameraFrame === f.id ? 'var(--wss-accent)' : undefined, borderColor: settings.cameraFrame === f.id ? 'var(--wss-accent)' : undefined, justifyContent: 'center' }}>{f.name}</button>)}
          </div>
          <div className="rs-filters-scroll" style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
            {FILTERS.map(f => <button key={f.id} onClick={() => dispatch({ type: 'SET_SETTINGS', payload: { webcamFilter: f.id } })} className="wss-btn" style={{ background: settings.webcamFilter === f.id ? 'var(--wss-accent)' : undefined, borderColor: settings.webcamFilter === f.id ? 'var(--wss-accent)' : undefined, justifyContent: 'center' }}>{f.name}</button>)}
          </div>
          <span className="wss-hint" style={{ display: 'flex', marginTop: '8px' }}><Move size={12} /> Drag webcam to move. Drag white circle to resize.</span>
        </div>
      )}

      {media.micOn && (
        <div className="wss-panel">
          <div className="wss-panel-title"><Mic size={14} /> Mic Volume</div>
          <label className="wss-hint" style={{ fontSize: '0.75rem', marginBottom: '4px' }}>Gain: {settings.micVolume}%</label>
          <input type="range" min="0" max="200" value={settings.micVolume} onChange={(e) => { dispatch({ type: 'SET_SETTINGS', payload: { micVolume: parseInt(e.target.value) } }); if (micGainRef.current) micGainRef.current.gain.value = parseInt(e.target.value) / 100; }} className="rs-range" style={{ width: '100%' }} />
        </div>
      )}
    </>
  );

  const SidebarButton = ({ icon, label, active, onClick }) => (
    <button onClick={onClick} className="wss-btn wss-btn-icon" style={{ color: active ? 'var(--wss-accent)' : undefined, flexDirection: 'column', height: '60px', width: '48px', gap: '4px' }}>
      {icon}
      <span style={{ fontSize: '0.6rem' }}>{label}</span>
    </button>
  );

  return (
    <div className="wss-container">
      <div className="wss-header">
        <div className="wss-header-left">
          <button onClick={() => navigate('/studio')} className="wss-btn wss-btn-icon"><ArrowLeft size={18} /></button>
          {!isMobile && <h1 className="wss-title">Web Showcase Studio</h1>}
        </div>
        <div className="wss-header-right">
          {exportData.isRecording && (
            <div className="wss-recording-badge">
              <Circle size={10} fill="#ef4444" /> {formatTime(elapsedTime)}
            </div>
          )}
          
          {exportData.recordedUrl ? (
            <>
              <button onClick={discardRecording} className="wss-btn wss-btn-danger">
                <Trash2 size={16} /> {!isMobile && 'Discard'}
              </button>
              <a href={exportData.recordedUrl} download={`web_showcase.${exportData.exportExt}`} className="wss-btn wss-btn-accent" style={{ textDecoration: 'none' }}>
                <Download size={16} /> {!isMobile && 'Download'}
              </a>
            </>
          ) : exportData.isRecording ? (
            <button onClick={stopRecording} className="wss-btn wss-btn-danger">
              <Square size={16} fill="#fff" /> Stop
            </button>
          ) : (
            <button onClick={startRecording} disabled={!media.screenReady} className="wss-btn wss-btn-accent">
              <Circle size={16} fill="#fff" /> Rec
            </button>
          )}
        </div>
      </div>

      <div className="wss-main">
        {!isMobile && (
          <div className="wss-sidebar">
            <SidebarButton icon={<Monitor size={20} />} label="Screen" active={media.screenReady} onClick={startScreenShare} />
            <SidebarButton icon={media.micOn ? <Mic size={20} /> : <MicOff size={20} />} label="Mic" active={media.micOn} onClick={toggleMic} />
            <SidebarButton icon={<Camera size={20} />} label="Camera" active={media.webcamOn} onClick={toggleWebcam} />
          </div>
        )}

        <div className="wss-canvas-area">
          <div 
            className="wss-canvas-wrap"
            data-ratio={settings.aspectRatio}
            onMouseDown={handlePointerDown} 
            onMouseMove={handlePointerMove} 
            onMouseUp={handlePointerUp} 
            onMouseLeave={handlePointerUp}
            onTouchStart={handlePointerDown} 
            onTouchMove={handlePointerMove} 
            onTouchEnd={handlePointerUp}
          >
            <canvas ref={canvasRef} className="wss-canvas" />
            
            {!media.screenReady && !exportData.recordedUrl && (
              <div className="wss-canvas-empty" onClick={startScreenShare}>
                <Monitor size={48} />
                <p>Tap to Share Screen</p>
                <span>(Select a Tab or Entire Screen)</span>
              </div>
            )}

            {exportData.recordedUrl && (
              <video src={exportData.recordedUrl} controls autoPlay loop className="wss-preview-video" />
            )}
            
            {exportData.isRecording && (
              <div className="rs-canvas-exporting" style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: 'rgba(0,0,0,0.8)', padding: '12px 20px', borderRadius: '8px', color: '#ef4444', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Circle size={12} fill="#ef4444" /> REC {formatTime(elapsedTime)}
              </div>
            )}
          </div>
        </div>

        {!isMobile && (
          <div className="wss-settings">
            {renderSettings()}
            <div className="wss-panel">
              <div className="wss-panel-title"><Volume2 size={14} /> Audio Sources</div>
              <div style={{ fontSize: '12px', color: '#cbd5e1', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Monitor size={14} color={media.screenReady && screenStreamRef.current?.getAudioTracks().length ? 'var(--wss-accent)' : undefined} /> 
                  Tab Audio: {media.screenReady && screenStreamRef.current?.getAudioTracks().length ? 'Active' : 'None'}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Mic size={14} color={media.micOn ? 'var(--wss-accent)' : undefined} /> 
                  Microphone: {media.micOn ? 'Active' : 'Off'}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {isMobile && (
        <div className="wss-mobile-toolbar">
          <button onClick={startScreenShare} className="wss-btn wss-btn-icon-mobile" style={{ color: media.screenReady ? 'var(--wss-accent)' : undefined }} title="Share Screen"><Monitor size={20} /></button>
          <button onClick={toggleMic} className="wss-btn wss-btn-icon-mobile" style={{ color: media.micOn ? 'var(--wss-accent)' : undefined }} title="Microphone">
            {media.micOn ? <Mic size={20} /> : <MicOff size={20} />}
          </button>
          <button onClick={toggleWebcam} className="wss-btn wss-btn-icon-mobile" style={{ color: media.webcamOn ? 'var(--wss-accent)' : undefined }} title="Webcam"><Camera size={20} /></button>
          <button onClick={() => setShowMobileSettings(true)} className="wss-btn wss-btn-icon-mobile" title="Settings"><Settings size={20} /></button>
        </div>
      )}

      {isMobile && showMobileSettings && (
        <div className="wss-modal-overlay" onClick={() => setShowMobileSettings(false)}>
          <div className="wss-modal-sheet" onClick={e => e.stopPropagation()}>
            <div className="wss-modal-header">
              <h3 className="wss-modal-title">Settings</h3>
              <button onClick={() => setShowMobileSettings(false)} className="wss-btn wss-btn-icon" style={{ background: 'transparent', border: 'none' }}><X size={18} /></button>
            </div>
            {renderSettings()}
          </div>
        </div>
      )}

      {toast && (
        <div className="rs-toast-container" style={{ pointerEvents: 'none' }}>
          <div className={`rs-toast rs-toast-${toast.type}`}>
            {toast.type === 'success' && <Check size={14} />}
            {toast.type === 'error' && <AlertTriangle size={14} />}
            {toast.type === 'info' && <Info size={14} />}
            <span>{toast.msg}</span>
          </div>
        </div>
      )}

      <video ref={screenVideoRef} className="wss-hidden-video" autoPlay playsInline muted />
      <video ref={webcamVideoRef} className="wss-hidden-video" autoPlay playsInline muted />
    </div>
  );
}