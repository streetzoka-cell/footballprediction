// footballprediction/src/studio/pages/WebShowcaseStudio.jsx

import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, Download, Monitor, Camera, Mic, MicOff, Volume2, Square, Circle, 
  Trash2, Move, AppWindow, Palette, Settings, X
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
  const dragRef = useRef({ active: false, mode: null, offsetX: 0, offsetY: 0 });
  const recordStartRef = useRef(0);

  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [showMobileSettings, setShowMobileSettings] = useState(false);

  const [aspectRatio, setAspectRatio] = useState('9:16'); // Default to TikTok mode
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
      console.warn("Screen share permission denied or canceled.");
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
        console.warn("Webcam access denied.");
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
        console.warn("Microphone access denied.");
      }
    }
  };

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

      ctx.beginPath();
      ctx.arc(x + size, y + size, 16, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.fill();
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      ctx.stroke();
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
    
    const handleX = webcamPos.x + webcamSize;
    const handleY = webcamPos.y + webcamSize;

    if (Math.hypot(x - handleX, y - handleY) < 30) {
      dragRef.current = { active: true, mode: 'resize' };
      return;
    }

    if (x >= webcamPos.x && x <= webcamPos.x + webcamSize && y >= webcamPos.y && y <= webcamPos.y + webcamSize) {
      dragRef.current = { active: true, mode: 'move', offsetX: x - webcamPos.x, offsetY: y - webcamPos.y };
    }
  };

  const handlePointerMove = (e) => {
    if (!dragRef.current.active) return;
    e.preventDefault();
    const { x, y } = getCanvasCoords(e);
    
    if (dragRef.current.mode === 'resize') {
      let newSize = Math.max(x - webcamPos.x, y - webcamPos.y);
      newSize = Math.max(80, Math.min(newSize, 600));
      setWebcamSize(newSize);
    } else if (dragRef.current.mode === 'move') {
      let newX = Math.max(0, Math.min(x - dragRef.current.offsetX, activeRatio.w - webcamSize));
      let newY = Math.max(0, Math.min(y - dragRef.current.offsetY, activeRatio.h - webcamSize));
      setWebcamPos({ x: newX, y: newY });
    }
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
      
      if (screenStreamRef.current && screenStreamRef.current.getAudioTracks().length > 0) {
        const src = audioCtx.createMediaStreamSource(new MediaStream(screenStreamRef.current.getAudioTracks()));
        src.connect(audioDest);
      }
      if (micStreamRef.current && micStreamRef.current.getAudioTracks().length > 0) {
        const src = audioCtx.createMediaStreamSource(new MediaStream(micStreamRef.current.getAudioTracks()));
        src.connect(audioDest);
      }

      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      gain.gain.value = 0.0;
      osc.connect(gain);
      gain.connect(audioDest);
      gain.connect(audioCtx.destination); 
      osc.start();

      audioDest.stream.getAudioTracks().forEach(t => mixedStreamRef.current.addTrack(t));
    } catch(e) { console.warn("Audio mix failed", e); }

    chunksRef.current = [];
    
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

  const renderSettings = () => (
    <>
      <div className="wss-panel">
        <div className="wss-panel-title"><AppWindow size={14} /> Aspect Ratio</div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {ASPECT_RATIOS.map(r => (
            <button 
              key={r.id} 
              onClick={() => setAspectRatio(r.id)} 
              className="wss-btn" 
              style={{ flex: 1, background: aspectRatio === r.id ? 'var(--wss-accent)' : undefined, borderColor: aspectRatio === r.id ? 'var(--wss-accent)' : undefined }}
            >
              {r.name}
            </button>
          ))}
        </div>
      </div>

      {webcamOn && (
        <div className="wss-panel">
          <div className="wss-panel-title"><Camera size={14} /> Webcam Shape</div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {CAMERA_FRAMES.map(f => (
              <button 
                key={f.id} 
                onClick={() => setCameraFrame(f.id)} 
                className="wss-btn"
                style={{ background: cameraFrame === f.id ? 'var(--wss-accent)' : undefined, borderColor: cameraFrame === f.id ? 'var(--wss-accent)' : undefined }}
              >
                {f.name}
              </button>
            ))}
          </div>
          <span className="wss-hint">
            <Move size={12} /> Drag to move. Drag white circle to resize.
          </span>
        </div>
      )}

      <div className="wss-panel">
        <div className="wss-panel-title"><Palette size={14} /> Letterbox Color</div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <input type="color" value={bgColor} onChange={(e) => setBgColor(e.target.value)} className="wss-input-color" />
          <input type="text" value={bgColor} onChange={(e) => setBgColor(e.target.value)} className="wss-input" />
        </div>
        <span className="wss-hint">Background shown if website doesn't fill screen.</span>
      </div>
    </>
  );

  return (
    <div className="wss-container">
      <div className="wss-header">
        <div className="wss-header-left">
          <button onClick={() => navigate('/studio')} className="wss-btn wss-btn-icon"><ArrowLeft size={18} /></button>
          <h1 className="wss-title">Web Showcase Studio</h1>
        </div>
        
        <div className="wss-header-right">
          {isRecording && (
            <div className="wss-recording-badge">
              <Circle size={10} fill="#ef4444" /> {formatTime(elapsedTime)}
            </div>
          )}
          
          {recordedUrl ? (
            <>
              <button onClick={discardRecording} className="wss-btn wss-btn-danger">
                <Trash2 size={16} /> {!isMobile && 'Discard'}
              </button>
              <a href={recordedUrl} download={`web_showcase.${exportExt}`} className="wss-btn wss-btn-accent" style={{ textDecoration: 'none' }}>
                <Download size={16} /> {!isMobile && 'Download'}
              </a>
            </>
          ) : isRecording ? (
            <button onClick={stopRecording} className="wss-btn wss-btn-danger">
              <Square size={16} fill="#fff" /> Stop
            </button>
          ) : (
            <button onClick={startRecording} disabled={!screenReady} className="wss-btn wss-btn-accent">
              <Circle size={16} fill="#fff" /> Rec
            </button>
          )}
        </div>
      </div>

      <div className="wss-main">
        <div className="wss-sidebar">
          <button onClick={startScreenShare} className="wss-btn wss-btn-icon" style={{ color: screenReady ? 'var(--wss-accent)' : undefined }} title="Share Screen"><Monitor size={20} /></button>
          <button onClick={toggleMic} className="wss-btn wss-btn-icon" style={{ color: micOn ? 'var(--wss-accent)' : undefined }} title="Toggle Microphone">
            {micOn ? <Mic size={20} /> : <MicOff size={20} />}
          </button>
          <button onClick={toggleWebcam} className="wss-btn wss-btn-icon" style={{ color: webcamOn ? 'var(--wss-accent)' : undefined }} title="Toggle Webcam"><Camera size={20} /></button>
        </div>

        <div className="wss-canvas-area">
          <div 
            className="wss-canvas-wrap"
            data-ratio={aspectRatio}
            onMouseDown={handlePointerDown} 
            onMouseMove={handlePointerMove} 
            onMouseUp={handlePointerUp} 
            onMouseLeave={handlePointerUp}
            onTouchStart={handlePointerDown} 
            onTouchMove={handlePointerMove} 
            onTouchEnd={handlePointerUp}
          >
            <canvas ref={canvasRef} className="wss-canvas" />
            
            {!screenReady && !recordedUrl && (
              <div className="wss-canvas-empty" onClick={startScreenShare}>
                <Monitor size={48} />
                <p>Tap to Share Screen</p>
                <span>(Select a Tab or Entire Screen)</span>
              </div>
            )}

            {recordedUrl && (
              <video src={recordedUrl} controls autoPlay loop className="wss-preview-video" />
            )}
          </div>
        </div>

        <div className="wss-settings">
          {renderSettings()}
          <div className="wss-panel">
            <div className="wss-panel-title"><Volume2 size={14} /> Audio Sources</div>
            <div style={{ fontSize: '12px', color: '#cbd5e1', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Monitor size={14} color={screenReady && screenStreamRef.current?.getAudioTracks().length ? 'var(--wss-accent)' : undefined} /> 
                Tab Audio: {screenReady && screenStreamRef.current?.getAudioTracks().length ? 'Active' : 'None'}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Mic size={14} color={micOn ? 'var(--wss-accent)' : undefined} /> 
                Microphone: {micOn ? 'Active' : 'Off'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {isMobile && (
        <div className="wss-mobile-toolbar">
          <button onClick={startScreenShare} className="wss-btn wss-btn-icon-mobile" style={{ color: screenReady ? 'var(--wss-accent)' : undefined }} title="Share Screen"><Monitor size={20} /></button>
          <button onClick={toggleMic} className="wss-btn wss-btn-icon-mobile" style={{ color: micOn ? 'var(--wss-accent)' : undefined }} title="Microphone">
            {micOn ? <Mic size={20} /> : <MicOff size={20} />}
          </button>
          <button onClick={toggleWebcam} className="wss-btn wss-btn-icon-mobile" style={{ color: webcamOn ? 'var(--wss-accent)' : undefined }} title="Webcam"><Camera size={20} /></button>
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

      <video ref={screenVideoRef} className="wss-hidden-video" autoPlay playsInline muted />
      <video ref={webcamVideoRef} className="wss-hidden-video" autoPlay playsInline muted />
    </div>
  );
}
