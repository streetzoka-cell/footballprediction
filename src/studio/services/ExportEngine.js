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
    if (view.getUint8(i) === 0x2A && view.getUint8(i + 1) === 0xD7 && view.getUint8(i + 2) === 0xB1) {
      timecodeOffset = i; break;
    }
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

export const exportProject = async ({ canvas, duration, videoElements, audioElements, onProgress }) => {
  const stream = canvas.captureStream(30);
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const dest = audioCtx.createMediaStreamDestination();

  // Mix all audio sources
  [...(videoElements || []), ...(audioElements || [])].forEach(el => {
    if (el && el.captureStream) {
      try {
        const source = audioCtx.createMediaStreamSource(el.captureStream());
        source.connect(dest);
      } catch (e) { /* Ignore elements without audio */ }
    }
  });
  dest.stream.getAudioTracks().forEach(t => stream.addTrack(t));

  // MP4 First, Fallback to WebM
  const mimeTypes = [
    'video/mp4;codecs=avc1.640029,mp4a.40.2',
    'video/mp4;codecs=h264',
    'video/mp4',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm'
  ];
  const mimeType = mimeTypes.find(type => MediaRecorder.isTypeSupported(type)) || 'video/webm';
  const isWebM = mimeType.includes('webm');

  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 12000000 });
  const chunks = [];

  return new Promise((resolve, reject) => {
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
    
    recorder.onstop = async () => {
      let blob = new Blob(chunks, { type: mimeType });
      if (isWebM) {
        blob = await fixWebmDuration(blob, duration * 1000);
      }
      audioCtx.close();
      resolve({ url: URL.createObjectURL(blob), format: isWebM ? 'webm' : 'mp4' });
    };

    recorder.start(100); // 100ms chunks for smooth, non-blocking progress

    // Non-blocking Progress Loop (No hangs!)
    const startTime = performance.now();
    const progressLoop = () => {
      const elapsed = (performance.now() - startTime) / 1000;
      const progress = Math.min(99, (elapsed / duration) * 100);
      onProgress(progress);
      
      if (elapsed < duration) {
        requestAnimationFrame(progressLoop);
      } else {
        recorder.stop();
        onProgress(100);
      }
    };
    requestAnimationFrame(progressLoop);

    // Sync and play all video elements
    (videoElements || []).forEach(v => { 
      if (v) { v.currentTime = 0; v.play().catch(() => {}); } 
    });
  });
};