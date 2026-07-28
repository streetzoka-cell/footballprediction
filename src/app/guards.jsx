// src/app/guards.jsx
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import AppLoader from "../components/AppLoader";

export function ProtectedRoute({ children }) {
  const { currentUser, authLoading } = useAuth();
  const location = useLocation();

  if (authLoading) return <AppLoader />;

  if (!currentUser) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return children;
}

export function GuestRoute({ children }) {
  const { currentUser, authLoading } = useAuth();

  if (authLoading) return <AppLoader />;

  if (currentUser) {
    return <Navigate to="/" replace />;
  }

  return children;
}

// ★ REFACTORED: Removed the extra Firestore getDoc call. 
// The AuthContext already securely fetches and monitors the user's role via onSnapshot.
export function AdminRoute({ children }) {
  const { currentUser, userProfile, authLoading } = useAuth();
  const location = useLocation();

  if (authLoading || (currentUser && !userProfile)) return <AppLoader />;

  if (!currentUser) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (userProfile?.role !== 'admin' && userProfile?.role !== 'staff') {
    return <Navigate to="/" replace />;
  }

  return children;
}