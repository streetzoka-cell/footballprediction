// src/core/KeyboardManager.jsx
import { useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';

export default function KeyboardManager() {
  const navigate = useNavigate();

  useEffect(() => {
    const handler = (e) => {
      // Cmd/Ctrl + K -> Focus Search (Conceptual: dispatch event to open command palette)
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        document.dispatchEvent(new CustomEvent('app:open-command-palette'));
      }
      
      // 'g' then 'h' -> Go Home
      if (e.key === 'g') {
        const timeout = setTimeout(() => {
          const handler2 = (e2) => {
            if (e2.key === 'h') navigate('/');
            if (e2.key === 'p') navigate('/predictions');
            if (e2.key === 'f') navigate('/fixtures');
            document.removeEventListener('keydown', handler2);
          };
          document.addEventListener('keydown', handler2);
        }, 500);
        setTimeout(() => clearTimeout(timeout), 600);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [navigate]);

  return null;
}