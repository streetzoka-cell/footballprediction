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

  const stopCameraStreams = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setCameraOn(false);
  };

  const startCamera = async () => {
    try {
      stopCameraStreams();
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1080, height: 1920, facingMode: 'user' }, audio: true });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(e => console.warn("Autoplay blocked", e));
      }
      setCameraOn(true);
    } catch (err) {
      alert("Camera access denied or not available.");
    }
  };

  const startRecording = () => {
    if (!streamRef.current) return;
    chunksRef.current = [];
    const recorder = new MediaRecorder(streamRef.current, { mimeType: 'video/webm' });
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: 'video/webm' });
      setRecordedUrl(URL.createObjectURL(blob));
      stopCameraStreams();
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
      stopCameraStreams();
    }
  };

  const handleDownload = () => {
    if (!recordedUrl) return;
    const a = document.createElement('a');
    a.href = recordedUrl;
    a.download = 'zokascore_reaction.webm';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  useEffect(() => { return () => { stopCameraStreams(); }; }, []);

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
    <div className="ms-container">
      <div className="ms-topbar">
        <div className="ms-topbar-left">
          <button onClick={() => navigate('/studio')} className="btn-icon btn-ghost" style={{ color: '#94a3b8' }}>
            <ArrowLeft size={16} /> <span className="hidden sm:inline">Back</span>
          </button>
          <h1 className="ms-topbar-title">Reaction Studio (9:16)</h1>
        </div>
        <button onClick={() => navigate('/studio/face-ar')} className="ms-topbar-btn">
          <Sparkles size={14} /> Face AR
        </button>
      </div>

      <div className="ms-canvas-area">
        <div className="ms-canvas-wrap">
          {recordedUrl ? (
            <video src={recordedUrl} controls autoPlay loop className="ms-video-el" style={{ filter, transform: effect }} />
          ) : (
            <video ref={videoRef} autoPlay playsInline muted className="ms-video-el" style={{ filter, transform: effect }} />
          )}
          
          {!cameraOn && !recordedUrl && (
            <div className="ms-canvas-empty">
              <Camera size={48} className="mb-12" />
              <p className="font-bold text-sm">Camera is off</p>
              <button onClick={startCamera} className="ms-enable-btn">
                Enable Camera
              </button>
            </div>
          )}

          {isRecording && (
            <div className="ms-rec-badge">
              <div className="w-2 h-2 bg-white rounded-full anim-pulse" /> REC
            </div>
          )}
        </div>
      </div>

      <div className="ms-controls">
        <div className="ms-actions-row">
          {!recordedUrl ? (
            <>
              {!cameraOn ? (
                <button onClick={startCamera} className="ms-action-btn"><Camera size={20} /></button>
              ) : (
                !isRecording ? (
                  <button onClick={startRecording} className="ms-action-btn" style={{ background: '#ef4444' }}><Circle size={24} fill="#fff" /></button>
                ) : (
                  <button onClick={stopRecording} className="ms-action-btn" style={{ background: '#334155' }}><Square size={20} fill="#fff" /></button>
                )
              )}
              <label className="ms-action-btn">
                <Upload size={20} />
                <input type="file" accept="video/*" onChange={handleImport} className="hidden" />
              </label>
            </>
          ) : (
            <>
              <button onClick={() => { setRecordedUrl(null); startCamera(); }} className="ms-action-btn"><Video size={20} /></button>
              <button onClick={handleDownload} className="ms-action-btn" style={{ background: '#10b981' }}><Download size={20} /></button>
            </>
          )}
        </div>

        <div className="mb-16">
          <div className="text-xs text-muted uppercase font-extrabold mb-2">Filters</div>
          <div className="ms-filter-row">
            {filters.map(f => (
              <button key={f.name} onClick={() => setFilter(f.css)} className={`ms-filter-btn ${filter === f.css ? 'active' : ''}`}>{f.name}</button>
            ))}
          </div>
        </div>

        <div>
          <div className="text-xs text-muted uppercase font-extrabold mb-2 flex items-center gap-1">
            <Sparkles size={10} /> Face Effects
          </div>
          <div className="ms-filter-row">
            {effects.map(e => (
              <button key={e.name} onClick={() => setEffect(e.css)} className={`ms-filter-btn ${effect === e.css ? 'active-gold' : ''}`}>{e.name}</button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}