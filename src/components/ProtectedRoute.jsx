import { Navigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { Spinner } from "./UI";
import { theme } from "../theme";

export default function ProtectedRoute({ children }) {
  const { user, activeUser } = useAuth();

  if (user === undefined) return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100vh", background: theme.background }}>
      <Spinner size={32} />
    </div>
  );

  if (!user)       return <Navigate to="/login" replace />;
  if (!activeUser) return <Navigate to="/login" replace />;

  return children;
}
