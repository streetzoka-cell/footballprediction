import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Circle, Square, Download, Camera, Sparkles, Sliders, Layers } from 'lucide-react';

export default function FaceARStudio() {
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const cameraInstanceRef = useRef(null);
  
  const [cameraOn, setCameraOn] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedUrl, setRecordedUrl] = useState(null);
  
  const [activeTab, setActiveTab] = useState('masks');
  const [activeFilter, setActiveFilter] = useState('none');
  const [activeMask, setActiveMask] = useState('trophy');
  const [activeEffect, setActiveEffect] = useState('none');

  const loadScript = (src) => {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
      const script = document.createElement('script');
      script.src = src; script.async = true; script.onload = resolve; script.onerror = reject;
      document.body.appendChild(script);
    });
  };

  const LANDMARKS = { FOREHEAD: 10, LEFT_EYE: 33, RIGHT_EYE: 263, MOUTH: 13, CHIN: 152, NOSE_TIP: 1 };

  const onResults = useCallback((results) => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;
    
    const ctx = canvas.getContext('2d');
    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    ctx.filter = activeFilter;
    ctx.scale(-1, 1);
    ctx.translate(-canvas.width, 0);
    ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
    ctx.restore();
    ctx.filter = 'none';

    if (activeEffect === 'vignette') {
      const grd = ctx.createRadialGradient(canvas.width/2, canvas.height/2, canvas.height/4, canvas.width/2, canvas.height/2, canvas.height/1.2);
      grd.addColorStop(0, 'rgba(0,0,0,0)');
      grd.addColorStop(1, 'rgba(0,0,0,0.85)');
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    } else if (activeEffect === 'stadium') {
      const grd = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
      grd.addColorStop(0, 'rgba(255,255,255,0.3)');
      grd.addColorStop(0.5, 'rgba(255,255,255,0)');
      grd.addColorStop(1, 'rgba(0,0,0,0.4)');
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0 && activeMask !== 'none') {
      const landmarks = results.multiFaceLandmarks[0];
      const forehead = landmarks[LANDMARKS.FOREHEAD];
      const leftEye = landmarks[LANDMARKS.LEFT_EYE];
      const rightEye = landmarks[LANDMARKS.RIGHT_EYE];
      const mouth = landmarks[LANDMARKS.MOUTH];
      const nose = landmarks[LANDMARKS.NOSE_TIP];

      const eyeDist = Math.hypot(leftEye.x - rightEye.x, leftEye.y - rightEye.y) * canvas.width;

      ctx.save();
      ctx.scale(-1, 1);
      ctx.translate(-canvas.width, 0);

      if (activeMask === 'trophy') {
        ctx.font = `${eyeDist * 1.8}px Arial`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('🏆', canvas.width - (forehead.x * canvas.width), forehead.y * canvas.height - (eyeDist * 1.0));
      } 
      else if (activeMask === 'fire') {
        ctx.font = `${eyeDist * 1.5}px Arial`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('🔥', canvas.width - (forehead.x * canvas.width), forehead.y * canvas.height - (eyeDist * 0.8));
      }
      else if (activeMask === 'crown') {
        ctx.font = `${eyeDist * 1.6}px Arial`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('👑', canvas.width - (forehead.x * canvas.width), forehead.y * canvas.height - (eyeDist * 0.9));
      }
      else if (activeMask === 'redcard') {
        const cardW = eyeDist * 0.8, cardH = eyeDist * 1.2;
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(canvas.width - (mouth.x * canvas.width) - cardW/2, mouth.y * canvas.height - cardH/4, cardW, cardH);
      }
      else if (activeMask === 'yellowcard') {
        const cardW = eyeDist * 0.8, cardH = eyeDist * 1.2;
        ctx.fillStyle = '#facc15';
        ctx.fillRect(canvas.width - (mouth.x * canvas.width) - cardW/2, mouth.y * canvas.height - cardH/4, cardW, cardH);
      }
      else if (activeMask === 'warpaint') {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
        ctx.save();
        ctx.translate(canvas.width - (leftEye.x * canvas.width), leftEye.y * canvas.height);
        ctx.rotate(Math.PI / 4); 
        ctx.fillRect(-eyeDist * 0.1, 0, eyeDist * 0.2, eyeDist * 0.8);
        ctx.restore();

        ctx.save();
        ctx.translate(canvas.width - (rightEye.x * canvas.width), rightEye.y * canvas.height);
        ctx.rotate(-Math.PI / 4); 
        ctx.fillRect(-eyeDist * 0.1, 0, eyeDist * 0.2, eyeDist * 0.8);
        ctx.restore();
      }
      else if (activeMask === 'mustache') {
        ctx.font = `${eyeDist * 0.8}px Arial`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('🥸', canvas.width - (nose.x * canvas.width), nose.y * canvas.height + (eyeDist * 0.3));
      }

      ctx.restore();
    }
  }, [activeFilter, activeMask, activeEffect]);

  const stopCameraStreams = () => {
    if (cameraInstanceRef.current) {
      try { cameraInstanceRef.current.stop(); } catch(e) {}
      cameraInstanceRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setCameraOn(false);
  };

  const startCamera = async () => {
    try {
      stopCameraStreams();
      await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js');
      await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/face_mesh.js');

      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 720, height: 1280, facingMode: 'user' }, audio: true });
      streamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      const faceMesh = new window.FaceMesh({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}` });
      faceMesh.setOptions({ maxNumFaces: 1, refineLandmarks: true, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
      faceMesh.onResults(onResults);

      const camera = new window.Camera(videoRef.current, {
        onFrame: async () => { if (videoRef.current) await faceMesh.send({ image: videoRef.current }); },
        width: 720, height: 1280
      });
      cameraInstanceRef.current = camera;
      camera.start();
      setCameraOn(true);
    } catch (err) {
      alert("Camera access timed out or was denied. Please ensure no other app is using the camera, refresh the page, and try again.");
      stopCameraStreams();
    }
  };

  const startRecording = () => {
    if (!canvasRef.current || !streamRef.current) return;
    const canvasStream = canvasRef.current.captureStream(30);
    const audioTracks = streamRef.current.getAudioTracks();
    audioTracks.forEach(track => canvasStream.addTrack(track));

    chunksRef.current = [];
    const recorder = new MediaRecorder(canvasStream, { mimeType: 'video/webm' });
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

  const handleDownload = () => {
    if (!recordedUrl) return;
    const a = document.createElement('a');
    a.href = recordedUrl;
    a.download = 'zokascore_football_ar.webm';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  useEffect(() => { return () => { stopCameraStreams(); }; }, []);

  const filters = [
    { id: 'none', name: 'Normal' }, { id: 'saturate(1.5) contrast(1.2)', name: 'Vivid' },
    { id: 'grayscale(1)', name: 'B&W' }, { id: 'sepia(0.7) contrast(1.1)', name: 'Retro' },
    { id: 'hue-rotate(180deg) saturate(1.2)', name: 'Cool' }, { id: 'brightness(1.2) saturate(1.2)', name: 'Bright' },
  ];

  const masks = [
    { id: 'none', name: 'None' }, { id: 'trophy', name: 'Champions 🏆' },
    { id: 'fire', name: 'On Fire 🔥' }, { id: 'crown', name: 'GOAT 👑' },
    { id: 'redcard', name: 'Red Card 🟥' }, { id: 'yellowcard', name: 'Yellow Card 🟨' },
    { id: 'warpaint', name: 'War Paint 🏈' }, { id: 'mustache', name: 'Disguise 🥸' },
  ];

  const effects = [
    { id: 'none', name: 'None' }, { id: 'vignette', name: 'Vignette' }, { id: 'stadium', name: 'Stadium Light' },
  ];

  return (
    <div className="ar-studio-container">
      <div className="ar-topbar">
        <button onClick={() => navigate('/studio/media')} className="btn-icon btn-ghost" style={{ color: '#94a3b8' }}>
          <ArrowLeft size={18} /> <span className="hidden md:inline">Back</span>
        </button>
        <h1 className="ar-topbar-title">Football Face AR</h1>
      </div>

      <div className="ar-main">
        <div className="ar-sidebar">
          <div className="ar-tabs">
            <button onClick={() => setActiveTab('masks')} className={`ar-tab-btn ${activeTab === 'masks' ? 'active' : ''}`}>
              <Sparkles size={18} /> <span className="hidden md:inline">Masks</span>
            </button>
            <button onClick={() => setActiveTab('filters')} className={`ar-tab-btn ${activeTab === 'filters' ? 'active' : ''}`}>
              <Sliders size={18} /> <span className="hidden md:inline">Filters</span>
            </button>
            <button onClick={() => setActiveTab('effects')} className={`ar-tab-btn ${activeTab === 'effects' ? 'active' : ''}`}>
              <Layers size={18} /> <span className="hidden md:inline">Effects</span>
            </button>
          </div>
          <div className="ar-tools-list">
            {activeTab === 'masks' && masks.map(e => (
              <button key={e.id} onClick={() => setActiveMask(e.id)} className={`ar-tool-btn ${activeMask === e.id ? 'active' : ''}`}>{e.name}</button>
            ))}
            {activeTab === 'filters' && filters.map(e => (
              <button key={e.id} onClick={() => setActiveFilter(e.id)} className={`ar-tool-btn ${activeFilter === e.id ? 'active' : ''}`}>{e.name}</button>
            ))}
            {activeTab === 'effects' && effects.map(e => (
              <button key={e.id} onClick={() => setActiveEffect(e.id)} className={`ar-tool-btn ${activeEffect === e.id ? 'active' : ''}`}>{e.name}</button>
            ))}
          </div>
        </div>

        <div className="ar-canvas-area">
          <div className="ar-video-wrapper">
            <video ref={videoRef} className="hidden" playsInline />
            <canvas ref={canvasRef} width={720} height={1280} className="w-full h-full object-cover" />

            {recordedUrl && (
              <video src={recordedUrl} controls autoPlay loop className="absolute inset-0 w-full h-full object-cover bg-black" />
            )}

            {!cameraOn && !recordedUrl && (
              <div className="ar-empty-state">
                <Camera size={48} className="mb-12" />
                <p className="font-bold text-sm">Camera is off</p>
                <button onClick={startCamera} className="ms-enable-btn">
                  Enable Face AR
                </button>
              </div>
            )}

            {isRecording && (
              <div className="ar-rec-badge">
                <div className="w-2 h-2 bg-white rounded-full anim-pulse" /> REC
              </div>
            )}
          </div>

          <div className="ar-controls">
            {!recordedUrl ? (
              <>
                {cameraOn && (
                  !isRecording ? (
                    <button onClick={startRecording} className="ar-btn" style={{ background: '#ef4444', border: 'none', width: '56px', height: '56px' }}><Circle size={24} fill="#fff" /></button>
                  ) : (
                    <button onClick={stopRecording} className="ar-btn" style={{ background: '#334155', border: 'none', width: '56px', height: '56px' }}><Square size={20} fill="#fff" /></button>
                  )
                )}
              </>
            ) : (
              <>
                <button onClick={() => { setRecordedUrl(null); }} className="ar-btn"><Camera size={20} /></button>
                <button onClick={handleDownload} className="ar-btn" style={{ background: '#10b981', border: 'none', width: '56px', height: '56px' }}><Download size={20} /></button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}