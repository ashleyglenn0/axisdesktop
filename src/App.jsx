import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./hooks/useAuth";
import ProtectedRoute from "./components/ProtectedRoute";
import Sidebar from "./components/Sidebar";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Library   from "./pages/Library";
import Finance   from "./pages/Finance";
import Chat      from "./pages/Chat";
import Analytics from "./pages/Analytics";
import Inbox     from "./pages/Inbox";
import Leads from "./pages/Leads";
import Pipeline from "./pages/Pipeline";
import Pricing from "./pages/Pricing";
import Events from "./pages/Events";
import CrewPool from "./pages/CrewPool";
import ActivationSetup from "./pages/ActivationSetup";
import ActivationConfig from "./pages/ActivationConfig";
import EventCommand from "./pages/EventCommand";
import ScheduleManager from "./pages/ScheduleManager";
import DocumentGenerator from "./pages/DocumentGenerator";
import { theme } from "./theme";

function AppShell({ children }) {
  return (
    <div style={{ display: "flex", minHeight: "100vh", background: theme.background }}>
      <Sidebar />
      <main style={{ flex: 1, minHeight: "100vh", overflowX: "hidden" }}>
        {children}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/dashboard" element={<ProtectedRoute><AppShell><Dashboard /></AppShell></ProtectedRoute>} />
          <Route path="/leads" element={<ProtectedRoute><AppShell><Leads /></AppShell></ProtectedRoute>} />
          <Route path="/pipeline" element={<ProtectedRoute><AppShell><Pipeline /></AppShell></ProtectedRoute>} />
          <Route path="/pricing" element={<ProtectedRoute><AppShell><Pricing /></AppShell></ProtectedRoute>} />
          <Route path="/crew-pool" element={<ProtectedRoute><AppShell><CrewPool /></AppShell></ProtectedRoute>} />
          <Route path="/activation-setup" element={<ProtectedRoute><AppShell><ActivationSetup /></AppShell></ProtectedRoute>} />
          <Route path="/activation-config/:intakeId" element={<ProtectedRoute><AppShell><ActivationConfig /></AppShell></ProtectedRoute>} />
          <Route path="/events" element={<ProtectedRoute><AppShell><Events /></AppShell></ProtectedRoute>} />
          <Route path="/schedule" element={<ProtectedRoute><AppShell><ScheduleManager /></AppShell></ProtectedRoute>} />
          <Route path="/event/:eventId" element={<ProtectedRoute><AppShell><EventCommand /></AppShell></ProtectedRoute>} />
          <Route path="/library" element={<ProtectedRoute><AppShell><Library /></AppShell></ProtectedRoute>} />
          <Route path="/finance" element={<ProtectedRoute><AppShell><Finance /></AppShell></ProtectedRoute>} />
          <Route path="/chat" element={<ProtectedRoute><AppShell><Chat /></AppShell></ProtectedRoute>} />
          <Route path="/analytics" element={<ProtectedRoute><AppShell><Analytics /></AppShell></ProtectedRoute>} />
          <Route path="/documents" element={<ProtectedRoute><AppShell><DocumentGenerator /></AppShell></ProtectedRoute>} />
          <Route path="/inbox" element={<ProtectedRoute><AppShell><Inbox /></AppShell></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}