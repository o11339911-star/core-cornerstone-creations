import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/platform/")({
  beforeLoad: () => {
    throw redirect({ to: "/platform/queue" });
  },
});
