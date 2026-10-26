"use client";

import { createContext, useContext } from "react";
import type { AppRole } from "@/lib/roles";

export type AppUser = {
  id: string;
  email: string;
  name: string;
  role: AppRole;
  department: string | null;
  pictureUrl: string | null;
  mustResetPassword: boolean;
  expenseAccess: boolean;
};

export const UserContext = createContext<AppUser | null>(null);

export function useUser(): AppUser | null {
  return useContext(UserContext);
}
