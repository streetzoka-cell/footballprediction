// src/studio/pages/WebShowcaseStudio.jsx
import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, Download, Monitor, Camera, Mic, MicOff, Volume2, VolumeX, Square, Circle, 
  Play, Pause, Loader, Trash2, Move, Film, AppWindow, Palette, Settings, X
} from 'lucide-react';

const ASPECT_RATIOS = [
  { id: '16:9', name: 'YT Long (16:9)', w: 1280, h: 720 },
  { id: '9:16', name: 'Shorts (9:16)', w: 720, h: 1280 },
];

const CAMERA_FRAMES = [
  { id: 'circle', name: 'Circle' },
  { id: 'rounded', name: 'Rounded' },
  { id: 'square', name: 'Square' },
  { id: 'neon', name: 'Neon Glow' }
];

// WebM Duration Fixer (Prevents 30m TikTok bug & corruption)
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

export default function WebShowcaseStudio() {
  const navigate = useNavigate();
  
  const canvasRef = useRef(null);
  const screenVideoRef = useRef(null);
  const webcamVideoRef = useRef(null);
  
  const screenStreamRef = useRef(null);
  const webcamStreamRef = useRef(null);
  const micStreamRef = useRef(null); 
  const mixedStreamRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const dragRef = useRef({ active: false, offsetX: 0, offsetY: 0 });
  const recordStartRef = useRef(0);

  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [showMobileSettings, setShowMobileSettings] = useState(false);

  const [aspectRatio, setAspectRatio] = useState('16:9');
  const [cameraFrame, setCameraFrame] = useState('circle');
  const [bgColor, setBgColor] = useState('#0f172a');
  const [webcamSize, setWebcamSize] = useState(250);

  const [screenReady, setScreenReady] = useState(false);
  const [webcamOn, setWebcamOn] = useState(false);
  const [micOn, setMicOn] = useState(false); 
  const [isRecording, setIsRecording] = useState(false);
  const [recordedUrl, setRecordedUrl] = useState(null);
  const [exportExt, setExportExt] = useState('webm');
  const [elapsedTime, setElapsedTime] = useState(0);

  const [webcamPos, setWebcamPos] = useState({ x: 50, y: 50 });
  const activeRatio = ASPECT_RATIOS.find(r => r.id === aspectRatio);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      stopStreams();
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
      setScreenReady(true);

      stream.getVideoTracks()[0].onended = () => {
        setScreenReady(false);
        if (screenVideoRef.current) screenVideoRef.current.srcObject = null;
        screenStreamRef.current = null;
      };
    } catch (err) {
      alert("Screen share permission denied or canceled.");
    }
  };

  const toggleWebcam = async () => {
    if (webcamOn) {
      if (webcamStreamRef.current) webcamStreamRef.current.getTracks().forEach(t => t.stop());
      webcamStreamRef.current = null;
      if (webcamVideoRef.current) webcamVideoRef.current.srcObject = null;
      setWebcamOn(false);
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720, facingMode: 'user' } });
        webcamStreamRef.current = stream;
        if (webcamVideoRef.current) {
          webcamVideoRef.current.srcObject = stream;
          webcamVideoRef.current.play();
        }
        setWebcamOn(true);
      } catch (err) {
        alert("Webcam access denied.");
      }
    }
  };

  const toggleMic = async () => {
    if (micOn) {
      if (micStreamRef.current) micStreamRef.current.getTracks().forEach(t => t.stop());
      micStreamRef.current = null;
      setMicOn(false);
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        micStreamRef.current = stream;
        setMicOn(true);
      } catch (err) {
        alert("Microphone access denied.");
      }
    }
  };

  // Uninterrupted Canvas Drawing Loop using Refs
  const drawFrameRef = useRef(() => {});
  
  drawFrameRef.current = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;
    
    canvas.width = activeRatio.w;
    canvas.height = activeRatio.h;

    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const screenVid = screenVideoRef.current;
    if (screenReady && screenVid && screenVid.videoWidth > 0) {
      const vidW = screenVid.videoWidth;
      const vidH = screenVid.videoHeight;
      const canvasRatio = canvas.width / canvas.height;
      const vidRatio = vidW / vidH;
      
      let sx, sy, sw, sh;
      if (vidRatio > canvasRatio) {
        sw = vidW; sh = vidW / canvasRatio; sx = 0; sy = (vidH - sh) / 2;
      } else {
        sh = vidH; sw = vidH * canvasRatio; sx = (vidW - sw) / 2; sy = 0;
      }
      ctx.drawImage(screenVid, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    }

    const webcamVid = webcamVideoRef.current;
    if (webcamOn && webcamVid && webcamVid.videoWidth > 0) {
      const size = webcamSize;
      const x = webcamPos.x;
      const y = webcamPos.y;
      
      ctx.save();
      
      if (cameraFrame === 'circle') {
        ctx.beginPath();
        ctx.arc(x + size/2, y + size/2, size/2, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        ctx.scale(-1, 1);
        ctx.translate(-(x + size), 0);
        ctx.drawImage(webcamVid, x, y, size, size);
      } else if (cameraFrame === 'rounded') {
        const r = 24;
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + size, y, x + size, y + size, r);
        ctx.arcTo(x + size, y + size, x, y + size, r);
        ctx.arcTo(x, y + size, x, y, r);
        ctx.arcTo(x, y, x + size, y, r);
        ctx.closePath();
        ctx.clip();
        ctx.scale(-1, 1);
        ctx.translate(-(x + size), 0);
        ctx.drawImage(webcamVid, x, y, size, size);
      } else if (cameraFrame === 'neon') {
        ctx.shadowColor = '#3b82f6';
        ctx.shadowBlur = 20;
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(x + size/2, y + size/2, size/2, 0, Math.PI * 2);
        ctx.closePath();
        ctx.stroke();
        ctx.shadowBlur = 0;
        
        ctx.beginPath();
        ctx.arc(x + size/2, y + size/2, size/2 - 4, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        ctx.scale(-1, 1);
        ctx.translate(-(x + size), 0);
        ctx.drawImage(webcamVid, x, y, size, size);
      } else {
        ctx.scale(-1, 1);
        ctx.translate(-(x + size),0);
        ctx.drawImage(webcamVid, x, y, size, size);
      }
      
      ctx.restore();
    }
  };

  useEffect(() => {
    let animFrame;
    const loop = () => { 
      drawFrameRef.current(); 
      animFrame = requestAnimationFrame(loop); 
    };
    animFrame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animFrame);
  }, []);

  const getCanvasCoords = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
  };

  const handlePointerDown = (e) => {
    if (!webcamOn) return;
    const { x, y } = getCanvasCoords(e);
    if (x >= webcamPos.x && x <= webcamPos.x + webcamSize && y >= webcamPos.y && y <= webcamPos.y + webcamSize) {
      dragRef.current = { active: true, offsetX: x - webcamPos.x, offsetY: y - webcamPos.y };
    }
  };

  const handlePointerMove = (e) => {
    if (!dragRef.current.active) return;
    e.preventDefault();
    const { x, y } = getCanvasCoords(e);
    let newX = Math.max(0, Math.min(x - dragRef.current.offsetX, activeRatio.w - webcamSize));
    let newY = Math.max(0, Math.min(y - dragRef.current.offsetY, activeRatio.h - webcamSize));
    setWebcamPos({ x: newX, y: newY });
  };

  const handlePointerUp = () => { dragRef.current.active = false; };

  useEffect(() => {
    let interval;
    if (isRecording) {
      recordStartRef.current = Date.now();
      interval = setInterval(() => {
        setElapsedTime(Math.floor((Date.now() - recordStartRef.current) / 1000));
      }, 1000);
    } else {
      setElapsedTime(0);
    }
    return () => clearInterval(interval);
  }, [isRecording]);

  const startRecording = async () => {
    if (!screenReady || !canvasRef.current) return;

    const canvasStream = canvasRef.current.captureStream(30);
    mixedStreamRef.current = new MediaStream();
    
    canvasStream.getVideoTracks().forEach(t => mixedStreamRef.current.addTrack(t));

    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') await audioCtx.resume();
      
      const audioDest = audioCtx.createMediaStreamDestination();
      let hasAudio = false;

      // 1. Capture Screen/Tab Audio
      if (screenStreamRef.current && screenStreamRef.current.getAudioTracks().length > 0) {
        const src = audioCtx.createMediaStreamSource(new MediaStream(screenStreamRef.current.getAudioTracks()));
        src.connect(audioDest);
        hasAudio = true;
      }
      
      // 2. Capture Microphone Audio
      if (micStreamRef.current && micStreamRef.current.getAudioTracks().length > 0) {
        const src = audioCtx.createMediaStreamSource(new MediaStream(micStreamRef.current.getAudioTracks()));
        src.connect(audioDest);
        hasAudio = true;
      }

      // 3. Silent fallback track (prevents 30m duration bug if no audio is selected)
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      gain.gain.value = 0.0;
      osc.connect(gain);
      gain.connect(audioDest);
      gain.connect(audioCtx.destination); // Prevent background tab throttling
      osc.start();

      audioDest.stream.getAudioTracks().forEach(t => mixedStreamRef.current.addTrack(t));
    } catch(e) { console.warn("Audio mix failed", e); }

    chunksRef.current = [];
    
    // Prefer MP4 if supported (for native iOS/Android gallery playback), fallback to WebM
    let mimeType = 'video/webm';
    let ext = 'webm';
    if (MediaRecorder.isTypeSupported('video/mp4')) {
      mimeType = 'video/mp4';
      ext = 'mp4';
    } else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) {
      mimeType = 'video/webm;codecs=vp9';
    } else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8')) {
      mimeType = 'video/webm;codecs=vp8';
    }
    setExportExt(ext);

    const recorder = new MediaRecorder(mixedStreamRef.current, { mimeType, videoBitsPerSecond: 8000000 });
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    recorder.onstop = async () => {
      const rawBlob = new Blob(chunksRef.current, { type: mimeType });
      const durationMs = Date.now() - recordStartRef.current;
      const fixedBlob = await fixWebmDuration(rawBlob, durationMs);
      setRecordedUrl(URL.createObjectURL(fixedBlob));
      setIsRecording(false);
    };

    recorder.start(100);
    recorderRef.current = recorder;
    setIsRecording(true);
    setRecordedUrl(null);
  };

  const stopRecording = () => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }
  };

  const discardRecording = () => {
    if (recordedUrl) {
      URL.revokeObjectURL(recordedUrl);
      setRecordedUrl(null);
    }
  };

  const formatTime = (s) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  const inputStyle = { background: '#1f2937', border: '1px solid #334155', borderRadius: '8px', padding: '8px 12px', color: '#fff', outline: 'none', width: '100%', fontSize: '13px' };
  const panelStyle = { background: '#0f172a', border: '1px solid #1f2937', borderRadius: '12px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' };
  const panelTitleStyle = { display: 'flex', alignItems: 'center', gap: '6px', color: '#64748b', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', marginBottom: '4px' };
  const topBtnStyle = { display: 'flex', alignItems: 'center', gap: '6px', background: '#1f2937', border: '1px solid #334155', color: '#fff', padding: '8px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' };
  const sideBtnStyle = { width: '40px', height: '40px', borderRadius: '8px', background: '#1f2937', border: '1px solid #334155', color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.2s' };
  const mobileBtnStyle = { width: '44px', height: '44px', borderRadius: '50%', background: '#1f2937', border: '1px solid #334155', color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.2s' };

  // Settings Panel Content (Shared between Desktop & Mobile)
  const renderSettings = () => (
    <>
      <div style={panelStyle}>
        <div style={panelTitleStyle}><AppWindow size={14} /> Aspect Ratio</div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {ASPECT_RATIOS.map(r => (
            <button key={r.id} onClick={() => setAspectRatio(r.id)} style={{ flex: 1, padding: '8px', borderRadius: '6px', border: '1px solid #334155', background: aspectRatio === r.id ? '#10b981' : '#1f2937', color: aspectRatio === r.id ? '#fff' : '#94a3b8', fontSize: '12px', cursor: 'pointer', fontWeight: 700 }}>
              {r.name}
            </button>
          ))}
        </div>
      </div>

      {webcamOn && (
        <div style={panelStyle}>
          <div style={panelTitleStyle}><Camera size={14} /> Webcam Settings</div>
          
          <label style={{ fontSize: '11px', color: '#94a3b8' }}>Frame Style</label>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {CAMERA_FRAMES.map(f => (
              <button key={f.id} onClick={() => setCameraFrame(f.id)} style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #334155', background: cameraFrame === f.id ? '#10b981' : '#1f2937', color: cameraFrame === f.id ? '#fff' : '#94a3b8', fontSize: '11px', cursor: 'pointer' }}>
                {f.name}
              </button>
            ))}
          </div>

          <label style={{ fontSize: '11px', color: '#94a3b8', marginTop: '8px' }}>Size: {webcamSize}px</label>
          <input type="range" min="100" max="500" value={webcamSize} onChange={(e) => setWebcamSize(parseInt(e.target.value))} style={{ width: '100%', accentColor: '#10b981' }} disabled={isRecording} />
          
          <span style={{ fontSize: '10px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px' }}>
            <Move size={12} /> Drag the webcam on the preview to position it.
          </span>
        </div>
      )}

      <div style={panelStyle}>
        <div style={panelTitleStyle}><Palette size={14} /> Letterbox Color</div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <input type="color" value={bgColor} onChange={(e) => setBgColor(e.target.value)} style={{ width: '40px', height: '38px', background: 'none', border: '1px solid #334155', borderRadius: '6px', cursor: 'pointer', padding: 0 }} />
          <input type="text" value={bgColor} onChange={(e) => setBgColor(e.target.value)} style={inputStyle} />
        </div>
        <span style={{ fontSize: '10px', color: '#64748b' }}>Background color shown if website doesn't fill the screen.</span>
      </div>
    </>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', background: '#0a0f1a', color: '#fff', overflow: 'hidden' }}>
      <div style={{ padding: isMobile ? '10px 12px' : '12px 16px', background: '#111827', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #1f2937', zIndex: 10, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button onClick={() => navigate('/studio')} style={topBtnStyle}><ArrowLeft size={18} /></button>
          {!isMobile && <h1 style={{ fontSize: '18px', fontWeight: 800, margin: 0 }}>Web Showcase Studio</h1>}
        </div>
        
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {isRecording && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#ef4444', fontWeight: 700, fontSize: '12px' }}>
              <Circle size={10} fill="#ef4444" /> {formatTime(elapsedTime)}
            </div>
          )}
          
          {recordedUrl ? (
            <>
              <button onClick={discardRecording} style={{ ...topBtnStyle, background: '#ef4444', borderColor: '#ef4444', padding: isMobile ? '6px' : '8px 12px' }}>
                <Trash2 size={16} /> {!isMobile && 'Discard'}
              </button>
              <a href={recordedUrl} download={`web_showcase.${exportExt}`} style={{ ...topBtnStyle, background: '#10b981', borderColor: '#10b981', textDecoration: 'none', padding: isMobile ? '6px' : '8px 12px' }}>
                <Download size={16} /> {!isMobile && 'Download'}
              </a>
            </>
          ) : isRecording ? (
            <button onClick={stopRecording} style={{ ...topBtnStyle, background: '#ef4444', borderColor: '#ef4444', padding: isMobile ? '6px 10px' : '8px 12px' }}>
              <Square size={16} fill="#fff" /> {!isMobile ? 'Stop' : 'Stop'}
            </button>
          ) : (
            <button onClick={startRecording} disabled={!screenReady} style={{ ...topBtnStyle, background: '#10b981', borderColor: '#10b981', opacity: !screenReady ? 0.5 : 1, padding: isMobile ? '6px 10px' : '8px 12px' }}>
              <Circle size={16} fill="#fff" /> {!isMobile ? 'Start' : 'Rec'}
            </button>
          )}
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {!isMobile && (
          <div style={{ width: '60px', background: '#111827', borderRight: '1px solid #1f2937', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '16px 0', gap: '16px' }}>
            <button onClick={startScreenShare} style={{...sideBtnStyle, color: screenReady ? '#10b981' : '#64748b'}} title="Share Screen / Tab"><Monitor size={20} /></button>
            <button onClick={toggleMic} style={{...sideBtnStyle, color: micOn ? '#10b981' : '#64748b'}} title="Toggle Microphone">
              {micOn ? <Mic size={20} /> : <MicOff size={20} />}
            </button>
            <button onClick={toggleWebcam} style={{...sideBtnStyle, color: webcamOn ? '#10b981' : '#64748b'}} title="Toggle Webcam"><Camera size={20} /></button>
          </div>
        )}

        <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: isMobile ? '10px' : '20px', background: '#000', minHeight: 0 }}>
          <div 
            style={{ position: 'relative', height: '100%', aspectRatio: activeRatio.id.replace(':', ' / '), borderRadius: '12px', overflow: 'hidden', border: '2px solid #1f2937', touchAction: 'none', boxShadow: '0 0 40px rgba(0,0,0,0.5)', cursor: webcamOn ? 'move' : 'default' }}
            onMouseDown={handlePointerDown} onMouseMove={handlePointerMove} onMouseUp={handlePointerUp} onMouseLeave={handlePointerUp}
            onTouchStart={handlePointerDown} onTouchMove={handlePointerMove} onTouchEnd={handlePointerUp}
          >
            <canvas ref={canvasRef} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            
            {!screenReady && !recordedUrl && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#111', color: '#64748b', cursor: 'pointer', gap: '12px', padding: '20px', textAlign: 'center' }} onClick={startScreenShare}>
                <Monitor size={48} />
                <p style={{ fontWeight: 700, fontSize: '16px' }}>Tap to Share Screen</p>
                <p style={{ fontSize: '12px', opacity: 0.7 }}>(Select a Tab or Entire Screen)</p>
              </div>
            )}

            {recordedUrl && (
              <video src={recordedUrl} controls autoPlay loop style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', background: '#000' }} />
            )}
          </div>
        </div>

        {!isMobile && (
          <div style={{ width: '300px', background: '#111827', borderLeft: '1px solid #1f2937', padding: '16px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {renderSettings()}
            <div style={panelStyle}>
              <div style={panelTitleStyle}><Volume2 size={14} /> Audio Sources</div>
              <div style={{ fontSize: '12px', color: '#cbd5e1', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Monitor size={14} color={screenReady && screenStreamRef.current?.getAudioTracks().length ? '#10b981' : '#64748b'} /> 
                  Tab Audio: {screenReady && screenStreamRef.current?.getAudioTracks().length ? 'Active' : 'None'}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Mic size={14} color={micOn ? '#10b981' : '#64748b'} /> 
                  Microphone: {micOn ? 'Active' : 'Off'}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Mobile Bottom Toolbar */}
      {isMobile && (
        <div style={{ height: '70px', background: '#111827', borderTop: '1px solid #1f2937', display: 'flex', alignItems: 'center', justifyContent: 'space-around', padding: '0 10px', flexShrink: 0 }}>
          <button onClick={startScreenShare} style={{...mobileBtnStyle, color: screenReady ? '#10b981' : '#64748b'}} title="Share Screen"><Monitor size={20} /></button>
          <button onClick={toggleMic} style={{...mobileBtnStyle, color: micOn ? '#10b981' : '#64748b'}} title="Microphone">
            {micOn ? <Mic size={20} /> : <MicOff size={20} />}
          </button>
          <button onClick={toggleWebcam} style={{...mobileBtnStyle, color: webcamOn ? '#10b981' : '#64748b'}} title="Webcam"><Camera size={20} /></button>
          <button onClick={() => setShowMobileSettings(true)} style={{...mobileBtnStyle, color: '#64748b'}} title="Settings"><Settings size={20} /></button>
        </div>
      )}

      {/* Mobile Settings Bottom Sheet */}
      {isMobile && showMobileSettings && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 100, display: 'flex', alignItems: 'flex-end' }} onClick={() => setShowMobileSettings(false)}>
          <div style={{ width: '100%', maxHeight: '70vh', background: '#0a0f1a', borderRadius: '16px 16px 0 0', border: '1px solid #334155', padding: '16px', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800 }}>Settings</h3>
              <button onClick={() => setShowMobileSettings(false)} style={{ background: '#1f2937', border: 'none', color: '#fff', padding: '4px', borderRadius: '6px', cursor: 'pointer' }}><X size={18} /></button>
            </div>
            {renderSettings()}
          </div>
        </div>
      )}

      {/* 
        Hidden video elements. 
        Positioned fixed with 2px size in the viewport so the browser's IntersectionObserver 
        doesn't throttle them. This forces Chrome to decode every single frame perfectly.
      */}
      <video ref={screenVideoRef} style={{ position: 'fixed', bottom: '2px', right: '2px', width: '2px', height: '2px', opacity: 0, pointerEvents: 'none', zIndex: -1 }} autoPlay playsInline muted />
      <video ref={webcamVideoRef} style={{ position: 'fixed', bottom: '2px', right: '2px', width: '2px', height: '2px', opacity: 0, pointerEvents: 'none', zIndex: -1 }} autoPlay playsInline muted />
    </div>
  );
}