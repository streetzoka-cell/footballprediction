// src/components/OfflineFallback.jsx
import React from 'react';
import { WifiOff, RefreshCw } from 'lucide-react';

export default function OfflineFallback({ onRetry }) {
  return (
    <div style={{ 
      minHeight: '100vh', 
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'center', 
      justifyContent: 'center', 
      background: 'radial-gradient(circle at 50% 50%, #0d1a25 0%, #05070a 80%)',
      gap: '24px',
      padding: '20px',
      textAlign: 'center'
    }}>
      <div style={{ 
        width: 80, 
        height: 80, 
        borderRadius: 22, 
        background: 'rgba(239, 68, 68, 0.1)', 
        border: '1px solid rgba(239, 68, 68, 0.2)',
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        boxShadow: '0 0 30px rgba(239, 68, 68, 0.1)'
      }}>
        <WifiOff size={36} color="#ef4444" />
      </div>
      
      <div>
        <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800, color: '#f8fafc', marginBottom: '8px' }}>
          You are Offline
        </h1>
        <p style={{ margin: 0, fontSize: '0.9rem', color: '#64748b', maxWidth: '400px', lineHeight: 1.5 }}>
          ZOKASCORE needs an internet connection to load this page for the first time. 
          Please check your network connection and try again.
        </p>
      </div>

      <button 
        onClick={onRetry || (() => window.location.reload())}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          padding: '12px 24px',
          borderRadius: '12px',
          background: '#10b981',
          color: '#05070a',
          fontWeight: 700,
          fontSize: '0.9rem',
          border: 'none',
          cursor: 'pointer',
          transition: 'transform 0.2s, box-shadow 0.2s',
          boxShadow: '0 4px 12px rgba(16, 185, 129, 0.2)'
        }}
      >
        <RefreshCw size={16} /> Retry Connection
      </button>
    </div>
  );
}