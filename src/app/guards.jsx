import { Navigate, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { db } from "../utils/firebase";
import { doc, getDoc } from "firebase/firestore";
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

export function AdminRoute({ children }) {
  const { currentUser, userProfile, authLoading } = useAuth();
  const location = useLocation();
  
  const [isAdmin, setIsAdmin] = useState(false);
  const [checkingAdmin, setCheckingAdmin] = useState(true);

  useEffect(() => {
    const verifyAdmin = async () => {
      if (authLoading) return;
      
      if (!currentUser) {
        setIsAdmin(false);
        setCheckingAdmin(false);
        return;
      }

      // 1. Fast check: Check if role is already in userProfile
      if (userProfile?.role === 'admin' || userProfile?.role === 'staff') {
        setIsAdmin(true);
        setCheckingAdmin(false);
        return;
      }

      // 2. Smart check: Look inside `admin_users` collection dynamically
      try {
        const adminSnap = await getDoc(doc(db, 'admin_users', currentUser.uid));
        setIsAdmin(adminSnap.exists());
      } catch (err) {
        console.error("Admin check failed:", err);
        setIsAdmin(false);
      }
      setCheckingAdmin(false);
    };

    verifyAdmin();
  }, [authLoading, currentUser, userProfile]);

  if (authLoading || checkingAdmin) return <AppLoader />;

  if (!currentUser) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  return children;
}