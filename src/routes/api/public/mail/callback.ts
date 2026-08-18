import { createFileRoute } from "@tanstack/react-router";

/**
 * عودة موافقة مزوّد البريد. الحالة موقّعة بـHMAC وتنتهي خلال عشر دقائق،
 * فلا يمكن ربط صندوق بريد بحساب آخر. لا تُعاد أي أسرار في الاستجابة.
 */
export const Route = createFileRoute("/api/public/mail/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const rawState = url.searchParams.get("state");
        const back = (result: string) =>
          new Response(null, {
            status: 302,
            headers: { location: `/settings/messaging?mail=${result}` },
          });

        if (!code || !rawState) return back("failed");

        const { verifyState } = await import("@/lib/mail/state.server");
        const state = verifyState(rawState);
        if (!state) return back("expired");

        try {
          const { adapterFor } = await import("@/lib/mail/adapters.server");
          const { upsertConnection } = await import("@/lib/mail/store.server");
          const adapter = adapterFor(state.provider);
          if (!adapter.configured()) return back("unconfigured");

          const redirectUri = `${url.origin}/api/public/mail/callback`;
          const tokens = await adapter.exchangeCode(code, redirectUri);
          if (!tokens.email) return back("failed");

          await upsertConnection({
            userId: state.userId,
            entityId: state.entityId,
            provider: state.provider,
            email: tokens.email,
            externalAccountId: tokens.externalAccountId,
            scopes: tokens.scopes,
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
            expiresAt: tokens.expiresAt,
          });
          return back("connected");
        } catch {
          return back("failed");
        }
      },
    },
  },
});
