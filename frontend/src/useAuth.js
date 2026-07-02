import { useState } from "react";

const STORAGE_KEY = "ipdr_insight_token";

export function useAuth() {
  const [token, setToken] = useState(localStorage.getItem(STORAGE_KEY) || "");
  const [username, setUsername] = useState("admin");

  const login = (payload) => {
    localStorage.setItem(STORAGE_KEY, payload.access_token);
    setToken(payload.access_token);
    setUsername(payload.username);
  };

  const logout = () => {
    localStorage.removeItem(STORAGE_KEY);
    setToken("");
    setUsername("");
  };

  return { token, username, login, logout };
}