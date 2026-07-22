// src/app/providers.jsx

import { AuthProvider } from "../context/AuthContext";
import { AppDataProvider } from "../context/AppDataContext";
import { FootballDataProvider } from "../context/FootballDataContext";

function InnerProviders({ children }) {
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