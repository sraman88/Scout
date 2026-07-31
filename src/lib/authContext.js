import { createContext, useContext } from "react";

export const AuthContext = createContext({ user: null, signOut: async () => {} });

export function useAuth() {
  return useContext(AuthContext);
}
