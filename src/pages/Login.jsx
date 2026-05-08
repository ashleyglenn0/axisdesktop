import { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { theme } from "../theme";
import { Button, Input } from "../components/UI";

const TEAM = ["Ashley Glenn", "Mikal Driver", "Shanell Jefferson"];

export default function Login() {
  const { selectUser } = useAuth();
  const navigate = useNavigate();

  const [step,     setStep]     = useState("login"); // login | select
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [error,    setError]    = useState("");
  const [loading,  setLoading]  = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      setStep("select");
    } catch (err) {
      setError("Incorrect email or password.");
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = (name) => {
    selectUser(name);
    navigate("/dashboard");
  };

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: `linear-gradient(135deg, ${theme.primaryDark} 0%, ${theme.primary} 60%, rgba(88,176,108,0.3) 100%)`,
      fontFamily: "'DM Sans', sans-serif",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;600;700&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600;9..40,700&display=swap');
        @keyframes fadeUp { from { opacity:0; transform:translateY(16px) } to { opacity:1; transform:translateY(0) } }
        * { box-sizing: border-box; }
      `}</style>

      <div style={{
        width: "100%", maxWidth: 400, padding: 20,
        animation: "fadeUp 0.4s ease",
      }}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: theme.accent, letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: 8 }}>
            Motion & Method
          </div>
          <h1 style={{
            margin: 0, fontSize: 32, fontWeight: 600, color: theme.onPrimary,
            fontFamily: "'Playfair Display', serif", letterSpacing: "-0.02em",
          }}>
            Axis Desktop
          </h1>
          <p style={{ margin: "8px 0 0", fontSize: 14, color: "rgba(255,255,255,0.5)" }}>
            Internal operations platform
          </p>
        </div>

        <div style={{
          background: theme.surface, borderRadius: 16, padding: "32px 28px",
          boxShadow: "0 32px 80px rgba(0,0,0,0.25)",
        }}>
          {step === "login" ? (
            <>
              <h2 style={{ margin: "0 0 20px", fontSize: 18, fontWeight: 700, color: theme.primary, fontFamily: "'Playfair Display', serif" }}>
                Sign In
              </h2>
              <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <Input
                  label="Email"
                  type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="team@motionmethodgroup.com" required
                />
                <Input
                  label="Password"
                  type="password" value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••" required
                />
                {error && (
                  <div style={{ fontSize: 13, color: theme.danger, background: theme.dangerSoft, padding: "8px 12px", borderRadius: 6 }}>
                    {error}
                  </div>
                )}
                <Button type="submit" disabled={loading} style={{ width: "100%", justifyContent: "center", marginTop: 4 }}>
                  {loading ? "Signing in…" : "Sign In →"}
                </Button>
              </form>
            </>
          ) : (
            <>
              <h2 style={{ margin: "0 0 6px", fontSize: 18, fontWeight: 700, color: theme.primary, fontFamily: "'Playfair Display', serif" }}>
                Who's operating?
              </h2>
              <p style={{ margin: "0 0 20px", fontSize: 13, color: theme.textMuted }}>
                Select your name — this tracks ownership and activity.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {TEAM.map(name => (
                  <button
                    key={name}
                    onClick={() => handleSelect(name)}
                    style={{
                      padding: "14px 18px", borderRadius: 10,
                      border: `1.5px solid ${theme.border}`,
                      background: theme.background, color: theme.primary,
                      fontSize: 15, fontWeight: 600, cursor: "pointer",
                      fontFamily: "'DM Sans', sans-serif",
                      textAlign: "left", transition: "all 0.15s ease",
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                    }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = theme.primary; e.currentTarget.style.background = theme.surface; e.currentTarget.style.boxShadow = "0 4px 16px rgba(28,74,54,0.12)"; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = theme.border; e.currentTarget.style.background = theme.background; e.currentTarget.style.boxShadow = "none"; }}
                  >
                    <span>{name}</span>
                    <span style={{ color: theme.accent, fontSize: 18 }}>→</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
