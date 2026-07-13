import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import AppLoader from "../components/AppLoader";

export function ProtectedRoute({ children }) {
  const { currentUser, authLoading } = useAuth();
  const location = useLocation();

  if (authLoading) return <AppLoader />;

  if (!currentUser)
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: location }}
      />
    );

  return children;
}

export function GuestRoute({ children }) {
  const { currentUser, authLoading } = useAuth();

  if (authLoading) return <AppLoader />;

  if (currentUser)
    return <Navigate to="/profile" replace />;

  return children;
}

export function AdminRoute({ children }) {
  const {
    currentUser,
    userProfile,
    authLoading,
  } = useAuth();

  const location = useLocation();

  if (authLoading) return <AppLoader />;

  if (!currentUser)
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: location }}
      />
    );

  if (userProfile?.role !== "admin")
    return <Navigate to="/" replace />;

  return children;
}