import * as React from "react";

/**
 * The active account scope is a CLIENT-SIDE CONVENIENCE ONLY.
 * Every protected server function must re-derive and re-authorize the scope
 * from the authenticated user's memberships. Never trust this value on the server.
 */

export type AccountScope = { kind: "personal" } | { kind: "entity"; entityId: string };

export const ACTIVE_ACCOUNT_STORAGE_KEY = "rakeez.active-account";

export function serializeScope(scope: AccountScope): string {
  return scope.kind === "personal" ? "personal" : `entity:${scope.entityId}`;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseScope(value: string | null | undefined): AccountScope | null {
  if (!value) return null;
  if (value === "personal") return { kind: "personal" };
  if (value.startsWith("entity:")) {
    const entityId = value.slice("entity:".length);
    if (UUID.test(entityId)) return { kind: "entity", entityId };
  }
  return null;
}

type ActiveAccountContextValue = {
  scope: AccountScope | null;
  setScope: (scope: AccountScope) => void;
  clearScope: () => void;
};

const ActiveAccountContext = React.createContext<ActiveAccountContextValue | null>(null);

export function ActiveAccountProvider({ children }: { children: React.ReactNode }) {
  const [scope, setScopeState] = React.useState<AccountScope | null>(null);

  // Read after hydration to avoid SSR/client markup mismatches.
  React.useEffect(() => {
    setScopeState(parseScope(window.localStorage.getItem(ACTIVE_ACCOUNT_STORAGE_KEY)));
  }, []);

  const setScope = React.useCallback((next: AccountScope) => {
    window.localStorage.setItem(ACTIVE_ACCOUNT_STORAGE_KEY, serializeScope(next));
    setScopeState(next);
  }, []);

  const clearScope = React.useCallback(() => {
    window.localStorage.removeItem(ACTIVE_ACCOUNT_STORAGE_KEY);
    setScopeState(null);
  }, []);

  const value = React.useMemo(
    () => ({ scope, setScope, clearScope }),
    [scope, setScope, clearScope],
  );

  return <ActiveAccountContext.Provider value={value}>{children}</ActiveAccountContext.Provider>;
}

export function useActiveAccount(): ActiveAccountContextValue {
  const ctx = React.useContext(ActiveAccountContext);
  if (!ctx) throw new Error("useActiveAccount must be used inside <ActiveAccountProvider>");
  return ctx;
}
