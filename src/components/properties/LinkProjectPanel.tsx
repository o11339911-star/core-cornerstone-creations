import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CardsSkeleton, ErrorState, SoftEmpty } from "@/components/rakeez";
import { useT } from "@/i18n";
import {
  linkPropertyToProject,
  listLinkCandidateProjects,
  type LinkCandidate,
} from "@/lib/properties.functions";

const PAGE_SIZE = 8;

/**
 * Compact "link a project" picker.
 *
 * The candidate list comes from a SECURITY DEFINER function that only returns
 * projects of the property's own account/entity, or projects explicitly
 * covered by an effective contract between both entities. The server re-checks
 * the same rule at write time, so this UI is presentation only.
 */
export function LinkProjectPanel({ propertyId, onLinked }: { propertyId: string; onLinked: () => void }) {
  const t = useT();
  const queryClient = useQueryClient();
  const fetchCandidates = useServerFn(listLinkCandidateProjects);
  const linkProject = useServerFn(linkPropertyToProject);

  const [term, setTerm] = React.useState("");
  const [debounced, setDebounced] = React.useState("");
  const [page, setPage] = React.useState(1);

  React.useEffect(() => {
    const id = setTimeout(() => {
      setDebounced(term.trim());
      setPage(1);
    }, 250);
    return () => clearTimeout(id);
  }, [term]);

  const query = useQuery({
    queryKey: ["link-candidate-projects", propertyId, debounced, page],
    queryFn: () =>
      fetchCandidates({
        data: { propertyId, ...(debounced ? { q: debounced } : {}), page, pageSize: PAGE_SIZE },
      }),
  });

  const mutation = useMutation({
    mutationFn: (projectId: string) =>
      linkProject({ data: { propertyId, projectId, relation: "related" } }),
    onSuccess: (result) => {
      if (!result.ok) {
        const reason = result.reason ?? "unknown";
        toast.error(t(`properties.links.denied.${reason}`, t("properties.links.denied.unknown")));
        void queryClient.invalidateQueries({ queryKey: ["link-candidate-projects", propertyId] });
        return;
      }
      toast.success(t("properties.links.linked"));
      void queryClient.invalidateQueries({ queryKey: ["link-candidate-projects", propertyId] });
      onLinked();
    },
    onError: () => toast.error(t("properties.links.denied.unknown")),
  });

  const items: LinkCandidate[] = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-3">
      <Input
        value={term}
        onChange={(event) => setTerm(event.target.value)}
        placeholder={t("properties.links.search")}
        className="min-h-11"
        aria-label={t("properties.links.search")}
      />

      {query.isPending ? (
        <CardsSkeleton count={3} />
      ) : query.isError ? (
        <ErrorState error={query.error as Error} reset={() => void query.refetch()} />
      ) : items.length === 0 ? (
        <SoftEmpty title={debounced ? t("properties.links.noResultsSearch") : t("properties.links.noResults")} />
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card p-3"
            >
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate font-medium">{item.name}</span>
                  <Badge variant={item.source === "own" ? "secondary" : "outline"}>
                    {item.source === "own"
                      ? t("properties.links.sourceOwn")
                      : t("properties.links.sourceContract")}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {item.code ? <bdi className="font-mono">{item.code}</bdi> : "—"}
                  {item.counterparty_name
                    ? ` · ${t("properties.links.counterparty")}: ${item.counterparty_name}`
                    : ""}
                </p>
              </div>
              <Button
                size="sm"
                className="min-h-11"
                disabled={mutation.isPending}
                onClick={() => mutation.mutate(item.id)}
              >
                {t("properties.links.link")}
              </Button>
            </li>
          ))}
        </ul>
      )}

      {total > PAGE_SIZE ? (
        <div className="flex items-center justify-between gap-2">
          <Button
            variant="outline"
            size="sm"
            className="min-h-11"
            disabled={page <= 1}
            onClick={() => setPage((value) => Math.max(1, value - 1))}
          >
            {t("properties.links.prev")}
          </Button>
          <span className="text-xs text-muted-foreground">
            <bdi>
              {page} / {lastPage}
            </bdi>
          </span>
          <Button
            variant="outline"
            size="sm"
            className="min-h-11"
            disabled={page >= lastPage}
            onClick={() => setPage((value) => Math.min(lastPage, value + 1))}
          >
            {t("properties.links.next")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
