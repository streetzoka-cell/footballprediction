// src/app/providers.jsx

import { AuthProvider, useAuth } from "../context/AuthContext";
import { AppDataProvider } from "../context/AppDataContext";
import { FootballDataProvider } from "../context/FootballDataContext";

function InnerProviders({ children }) {
  // AppDataProvider now calls useAuth() internally, so we don't need to pass props.
  // We just need to ensure AuthProvider is above it, which it is.
  return (
    <AppDataProvider>
      <FootballDataProvider>
        {children}
      </FootballDataProvider>
    </AppDataProvider>
  );
}

export default function Providers({ children }) {
  return (
    <AuthProvider>
      <InnerProviders>
        {children}
      </InnerProviders>
    </AuthProvider>
  );
}