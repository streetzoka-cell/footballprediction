// src/studio/components/pro-editor/ProCanvas.jsx
import React, { useRef, useEffect } from 'react';
import { Stage, Layer, Rect, Text, Image as KonvaImage, Transformer } from 'react-konva';
import { useProEditorStore } from '../../store/proEditorStore';

const ProLayer = ({ layer, isSelected, onSelect, onChange }) => {
  const shapeRef = useRef(null);
  const [img] = useImage(layer.src || '', 'anonymous');

  // Interpolate keyframes based on current playhead
  const getAnimatedProp = (prop, fallback) => {
    const keyframes = layer.keyframes?.filter(k => k.prop === prop) || [];
    if (keyframes.length === 0) return layer[prop] ?? fallback;

    const playhead = useProEditorStore.getState().playhead;
    let prevKf = null, nextKf = null;

    keyframes.forEach(kf => {
      if (kf.time <= playhead) prevKf = kf;
      if (kf.time > playhead && !nextKf) nextKf = kf;
    });

    if (!prevKf && !nextKf) return layer[prop] ?? fallback;
    if (!nextKf) return prevKf.value;
    if (!prevKf) return nextKf.value;

    // Linear interpolation
    const t = (playhead - prevKf.time) / (nextKf.time - prevKf.time);
    return prevKf.value + (nextKf.value - prevKf.value) * t;
  };

  const commonProps = {
    ref: shapeRef,
    x: getAnimatedProp('x', 0),
    y: getAnimatedProp('y', 0),
    rotation: getAnimatedProp('rotation', 0),
    opacity: getAnimatedProp('opacity', 1),
    draggable: true,
    onClick: onSelect,
    onTap: onSelect,
    onDragEnd: (e) => onChange({ x: e.target.x(), y: e.target.y() }),
    onTransformEnd: (e) => {
      const node = e.target;
      onChange({
        x: node.x(), y: node.y(), rotation: node.rotation(),
        width: Math.max(5, node.width() * node.scaleX()),
        height: Math.max(5, node.height() * node.scaleY())
      });
      node.scaleX(1); node.scaleY(1);
    }
  };

  if (layer.type === 'text') return <Text {...commonProps} text={layer.text} fontSize={layer.fontSize} fill={layer.fill} />;
  if (layer.type === 'rect') return <Rect {...commonProps} width={layer.width} height={layer.height} fill={layer.fill} cornerRadius={layer.cornerRadius} />;
  if (layer.type === 'image' || layer.type === 'video') return <KonvaImage {...commonProps} image={img} width={layer.width} height={layer.height} />;
  return null;
};

export default function ProCanvas() {
  const stageRef = useRef(null);
  const transformerRef = useRef(null);
  const { layers, selectedLayerId, selectLayer, updateLayer } = useProEditorStore();

  useEffect(() => {
    if (selectedLayerId && transformerRef.current) {
      const node = stageRef.current.findOne('#' + selectedLayerId);
      if (node) transformerRef.current.nodes([node]);
    } else {
      transformerRef.current?.nodes([]);
    }
  }, [selectedLayerId, layers]);

  return (
    <Stage width={720} height={1280} onMouseDown={(e) => { if (e.target === e.target.getStage()) selectLayer(null); }}>
      <Layer>
        <Rect width={720} height={1280} fill="#000" />
        {layers.map(layer => (
          <ProLayer 
            key={layer.id} 
            layer={layer} 
            isSelected={layer.id === selectedLayerId}
            onSelect={() => selectLayer(layer.id)}
            onChange={(newAttrs) => updateLayer(layer.id, newAttrs)}
          />
        ))}
        <Transformer ref={transformerRef} borderStroke="#10b981" anchorStroke="#10b981" />
      </Layer>
    </Stage>
  );
}