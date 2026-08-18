import { useQuery } from "@tanstack/react-query";

import { useActiveAccount } from "@/lib/active-account";
import { type MembershipRow } from "@/lib/auth.functions";
import { fetchMyMemberships } from "@/lib/memberships-query";

/**
 * UI-only view of the caller's verified account context.
 *
 * The active scope stored in localStorage is never trusted on its own: the
 * entity it points at must also appear in the server-verified membership list
 * returned by `getMyMemberships()`. Every server function still re-authorizes
 * independently — this hook only decides what the interface shows.
 */
export type AccountUi = {
  loading: boolean;
  error: Error | null;
  memberships: MembershipRow[];
  activeMembership: MembershipRow | null;
  activeEntity: MembershipRow["entity"] | null;
  isPersonal: boolean;
  isDeveloper: boolean;
};

export const MY_MEMBERSHIPS_QUERY_KEY = ["my-memberships"] as const;

export function useAccountUi(): AccountUi {
  const { scope } = useActiveAccount();

  const query = useQuery({
    queryKey: MY_MEMBERSHIPS_QUERY_KEY,
    queryFn: () => fetchMyMemberships(),
    staleTime: 60_000,
  });

  const memberships = query.data ?? [];
  const activeMembership =
    scope?.kind === "entity"
      ? (memberships.find((m) => m.entity.id === scope.entityId) ?? null)
      : null;

  return {
    loading: query.isPending,
    error: (query.error as Error | null) ?? null,
    memberships,
    activeMembership,
    activeEntity: activeMembership?.entity ?? null,
    isPersonal: !scope || scope.kind === "personal",
    // Property registry is a developer-entity capability only.
    isDeveloper: activeMembership?.entity.type === "developer",
  };
}
