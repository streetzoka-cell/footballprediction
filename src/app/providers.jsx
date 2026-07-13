import { AuthProvider, useAuth } from "../context/AuthContext";
import { AppDataProvider } from "../context/AppDataContext";
import { FootballDataProvider } from "../context/FootballDataContext";

function InnerProviders({ children }) {
  const { currentUser } = useAuth();

  return (
    <AppDataProvider
      userId={currentUser?.uid ?? null}
      displayName={
        currentUser?.displayName ??
        currentUser?.email?.split("@")[0] ??
        null
      }
    >
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