// src/utils/shareUtils.js

export function buildGroupShareText(group) {
  const lines = [];
  lines.push(`⚡ ZOKASCORE — ${group.title}`);
  lines.push(`📊 Avg confidence: ${group.avgConfidence}%${group.risky ? ' ⚠️ risky market' : ''}`);
  lines.push('');
  group.matches.forEach((m, i) => {
    lines.push(`${i + 1}. ${m.home} vs ${m.away}${m.league ? ` [${m.league}]` : ''}`);
    lines.push(`   👉 ${m.pick} — ${m.confidence}%`);
  });
  lines.push('');
  lines.push(`🗓 ${group.date} | 🤖 Zoka V2 ML`);
  return lines.join('\n');
}

export async function shareText(title, text) {
  if (navigator.share) {
    try { await navigator.share({ title, text }); return 'shared'; }
    catch (e) { if (e?.name === 'AbortError') return 'aborted'; }
  }
  await navigator.clipboard.writeText(text);
  return 'copied';
}

/* html2canvas is heavy → load only when a screenshot is requested */
async function captureNode(node) {
  const { default: html2canvas } = await import('html2canvas');
  try {
    return await html2canvas(node, { backgroundColor: '#0b0e14', scale: 2, useCORS: true, logging: false });
  } catch (err) {
    // Cross-origin logos taint the canvas → retry with images hidden (layout kept)
    node.classList.add('shot-no-img');
    try {
      return await html2canvas(node, { backgroundColor: '#0b0e14', scale: 2, logging: false });
    } finally {
      node.classList.remove('shot-no-img');
    }
  }
}

export async function screenshotNode(node, filename) {
  const canvas = await captureNode(node);
  const url = canvas.toDataURL('image/png');
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  return 'downloaded';
}

export async function shareNodeAsImage(node, filename, title) {
  const canvas = await captureNode(node);
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
  const file = new File([blob], filename, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ title, files: [file] }); return 'shared'; }
    catch (e) { if (e?.name === 'AbortError') return 'aborted'; }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  return 'downloaded';
}