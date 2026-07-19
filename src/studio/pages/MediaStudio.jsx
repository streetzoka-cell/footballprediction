import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Circle, Square, Upload, Download, Camera, Sparkles, Video } from 'lucide-react';

export default function MediaStudio() {
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);

  const [cameraOn, setCameraOn] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedUrl, setRecordedUrl] = useState(null);
  const [filter, setFilter] = useState('none');
  const [effect, setEffect] = useState('none');

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1080, height: 1920 }, audio: true });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setCameraOn(true);
    } catch (err) {
      alert("Camera access denied or not available.");
    }
  };

  const stopCamera = () => {
    if (streamRef.current) streamRef.current.getTracks().forEach(track => track.stop());
    setCameraOn(false);
  };

  const startRecording = () => {
    if (!streamRef.current) return;
    chunksRef.current = [];
    const recorder = new MediaRecorder(streamRef.current, { mimeType: 'video/webm' });
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: 'video/webm' });
      setRecordedUrl(URL.createObjectURL(blob));
    };
    recorder.start();
    mediaRecorderRef.current = recorder;
    setIsRecording(true);
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const handleImport = (e) => {
    const file = e.target.files[0];
    if (file) {
      setRecordedUrl(URL.createObjectURL(file));
      stopCamera();
    }
  };

  const handleDownload = () => {
    if (!recordedUrl) return;
    const a = document.createElement('a');
    a.href = recordedUrl;
    a.download = 'zokascore_reaction.webm';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  useEffect(() => {
    return () => { if (streamRef.current) streamRef.current.getTracks().forEach(track => track.stop()); };
  }, []);

  const filters = [
    { name: 'Original', css: 'none' }, { name: 'Vivid', css: 'saturate(1.5) contrast(1.2)' },
    { name: 'B&W', css: 'grayscale(1)' }, { name: 'Retro', css: 'sepia(0.7) contrast(1.1)' },
    { name: 'Cool', css: 'hue-rotate(180deg) saturate(1.2)' },
  ];

  const effects = [
    { name: 'None', css: 'none' }, { name: 'Mirror', css: 'scaleX(-1)' },
    { name: 'Wide', css: 'scaleX(1.3)' }, { name: 'Tall', css: 'scaleY(1.3)' },
    { name: 'Tilt', css: 'rotate(10deg)' }, { name: 'Squish', css: 'scaleY(0.7) scaleX(1.2)' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#0a0f1a', color: '#fff', overflow: 'hidden' }}>
      <div style={{ padding: '16px', background: '#111827', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #1f2937', zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button onClick={() => navigate('/studio')} style={{ color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <ArrowLeft size={16} /> Back
          </button>
          <h1 style={{ fontSize: '16px', fontWeight: 800, margin: 0 }}>Reaction Studio (9:16)</h1>
        </div>
        <button onClick={() => navigate('/studio/face-ar')} style={{ background: '#3b82f6', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '8px', fontWeight: 700, fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
          <Sparkles size={14} /> Face AR
        </button>
      </div>

      <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px', background: '#000', position: 'relative' }}>
        <div style={{ width: '100%', maxWidth: '400px', aspectRatio: '9/16', background: '#000', borderRadius: '16px', overflow: 'hidden', position: 'relative', border: '2px solid #1f2937', boxShadow: '0 0 20px rgba(0,0,0,0.5)' }}>
          {recordedUrl ? (
            <video src={recordedUrl} controls autoPlay loop style={{ width: '100%', height: '100%', objectFit: 'cover', filter: filter, transform: effect }} />
          ) : (
            <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover', filter: filter, transform: effect, transformOrigin: 'center' }} />
          )}
          
          {!cameraOn && !recordedUrl && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
              <Camera size={48} style={{ marginBottom: '12px' }} />
              <p style={{ fontWeight: 700, fontSize: '14px' }}>Camera is off</p>
              <button onClick={startCamera} style={{ marginTop: '16px', background: '#10b981', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '8px', fontWeight: 700, fontSize: '12px', cursor: 'pointer' }}>
                Enable Camera
              </button>
            </div>
          )}

          {isRecording && (
            <div style={{ position: 'absolute', top: '16px', right: '16px', background: 'rgba(239,68,68,0.9)', padding: '4px 12px', borderRadius: '20px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 800 }}>
              <div style={{ width: '8px', height: '8px', background: '#fff', borderRadius: '50%', animation: 'pulse 1.5s infinite' }} /> REC
            </div>
          )}
        </div>
      </div>

      <div style={{ background: '#111827', borderTop: '1px solid #1f2937', padding: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '20px', marginBottom: '20px' }}>
          {!recordedUrl ? (
            <>
              {!cameraOn ? (
                <button onClick={startCamera} style={actionBtnStyle}><Camera size={20} /></button>
              ) : (
                !isRecording ? (
                  <button onClick={startRecording} style={{ ...actionBtnStyle, background: '#ef4444' }}><Circle size={24} fill="#fff" /></button>
                ) : (
                  <button onClick={stopRecording} style={{ ...actionBtnStyle, background: '#334155' }}><Square size={20} fill="#fff" /></button>
                )
              )}
              <label style={actionBtnStyle}>
                <Upload size={20} />
                <input type="file" accept="video/*" onChange={handleImport} style={{ display: 'none' }} />
              </label>
            </>
          ) : (
            <>
              <button onClick={() => { setRecordedUrl(null); startCamera(); }} style={actionBtnStyle}><Video size={20} /></button>
              <button onClick={handleDownload} style={{ ...actionBtnStyle, background: '#10b981' }}><Download size={20} /></button>
            </>
          )}
        </div>

        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontSize: '10px', color: '#64748b', textTransform: 'uppercase', fontWeight: 800, marginBottom: '8px' }}>Filters</div>
          <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
            {filters.map(f => (
              <button key={f.name} onClick={() => setFilter(f.css)} style={{ padding: '6px 14px', borderRadius: '20px', border: '1px solid #334155', background: filter === f.css ? '#10b981' : '#1f2937', color: filter === f.css ? '#fff' : '#94a3b8', fontSize: '11px', fontWeight: 700, whiteSpace: 'nowrap', cursor: 'pointer' }}>{f.name}</button>
            ))}
          </div>
        </div>

        <div>
          <div style={{ fontSize: '10px', color: '#64748b', textTransform: 'uppercase', fontWeight: 800, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Sparkles size={10} /> Face Effects
          </div>
          <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
            {effects.map(e => (
              <button key={e.name} onClick={() => setEffect(e.css)} style={{ padding: '6px 14px', borderRadius: '20px', border: '1px solid #334155', background: effect === e.css ? '#f59e0b' : '#1f2937', color: effect === e.css ? '#fff' : '#94a3b8', fontSize: '11px', fontWeight: 700, whiteSpace: 'nowrap', cursor: 'pointer' }}>{e.name}</button>
            ))}
          </div>
        </div>
      </div>

      <style>{`@keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0.3; } 100% { opacity: 1; } }`}</style>
    </div>
  );
}

const actionBtnStyle = { width: '56px', height: '56px', borderRadius: '50%', background: '#1f2937', border: '1px solid #334155', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.2s' };