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

// ★ UPDATED: Now checks the exact same `isAdmin` boolean that the Navbar uses!
export function AdminRoute({ children }) {
  const { currentUser, userProfile, authLoading } = useAuth();
  const location = useLocation();

  // Wait for both Auth and UserProfile to load
  if (authLoading || (currentUser && !userProfile)) return <AppLoader />;

  // If not logged in, send to login
  if (!currentUser) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  // If logged in but NOT an admin, kick them to home page
  if (!userProfile?.isAdmin) {
    return <Navigate to="/" replace />;
  }

  return children;
}