import { NavLink, useNavigate } from "react-router-dom";
import { signOut } from "firebase/auth";
import { auth } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { theme } from "../theme";

const NAV = [
  { to: "/dashboard",        label: "Dashboard",        icon: "⬡" },
  { to: "/leads",            label: "Leads",            icon: "◈" },
  { to: "/pipeline",         label: "Pipeline",         icon: "⬢" },
  { to: "/crew-pool",        label: "Talent Pool",      icon: "◎" },
  { to: "/activation-setup", label: "Activation Queue", icon: "◇" },
  { to: "/events",           label: "Events",           icon: "◉" },
  { to: "/library",          label: "Library",          icon: "◫" },
  { to: "/finance",          label: "Finance",          icon: "◈" },
  { to: "/chat",             label: "Chat",             icon: "◎" },
  { to: "/analytics",       label: "Analytics",        icon: "◈" },
  { to: "/inbox",           label: "Inbox",            icon: "✉" },
];

export default function Sidebar() {
  const { activeUser, clearUser } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    clearUser();
    await signOut(auth);
    navigate("/login");
  };

  return (
    <aside style={{
      width: 220, flexShrink: 0, height: "100vh", position: "sticky", top: 0,
      background: theme.primary, display: "flex", flexDirection: "column",
      borderRight: `1px solid ${theme.primaryDark}`,
    }}>
      {/* Logo */}
      <div style={{ padding: "24px 20px 20px", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: theme.accent, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 4 }}>
          Motion & Method
        </div>
        <div style={{ fontSize: 18, fontWeight: 700, color: theme.onPrimary, fontFamily: "'Playfair Display', serif", letterSpacing: "-0.02em" }}>
          Axis Desktop
        </div>
      </div>

      {/* Active user */}
      {activeUser && (
        <div style={{ padding: "12px 20px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>Logged in as</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: theme.accent }}>{activeUser}</div>
        </div>
      )}

      {/* Nav links */}
      <nav style={{ flex: 1, padding: "16px 0", overflowY: "auto" }}>
        {NAV.map(({ to, label, icon }) => (
          <NavLink
            key={to} to={to}
            style={({ isActive }) => ({
              display: "flex", alignItems: "center", gap: 10,
              padding: "10px 20px", textDecoration: "none",
              fontSize: 13, fontWeight: 600,
              color: isActive ? theme.accent : "rgba(255,255,255,0.65)",
              background: isActive ? "rgba(235,199,100,0.1)" : "transparent",
              borderLeft: isActive ? `3px solid ${theme.accent}` : "3px solid transparent",
              transition: "all 0.15s ease",
            })}
          >
            <span style={{ fontSize: 14, opacity: 0.8 }}>{icon}</span>
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Logout */}
      <div style={{ padding: "16px 20px", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
        <button
          onClick={handleLogout}
          style={{
            width: "100%", padding: "9px 0", borderRadius: 8,
            background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)",
            color: "rgba(255,255,255,0.6)", fontSize: 12, fontWeight: 600,
            cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
            transition: "all 0.15s ease",
          }}
          onMouseEnter={e => { e.target.style.background = "rgba(255,255,255,0.12)"; e.target.style.color = "#fff"; }}
          onMouseLeave={e => { e.target.style.background = "rgba(255,255,255,0.07)"; e.target.style.color = "rgba(255,255,255,0.6)"; }}
        >
          Sign Out
        </button>
      </div>
    </aside>
  );
}