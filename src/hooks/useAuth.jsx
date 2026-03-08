import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../firebase";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user,        setUser]        = useState(undefined); // undefined = loading
  const [activeUser,  setActiveUser]  = useState(() => sessionStorage.getItem("axis_name") || null);

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => setUser(u ?? null));
  }, []);

  const selectUser = (name) => {
    setActiveUser(name);
    sessionStorage.setItem("axis_name", name);
  };

  const clearUser = () => {
    setActiveUser(null);
    sessionStorage.removeItem("axis_name");
  };

  return (
    <AuthContext.Provider value={{ user, activeUser, selectUser, clearUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
