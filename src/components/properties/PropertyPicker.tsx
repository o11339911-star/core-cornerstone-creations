import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, ChevronsUpDown, Loader2, Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n";
import { toLatinDigits } from "@/lib/format";
import { searchLinkableProperties, type PropertyOption } from "@/lib/properties.functions";

/** Latin-digit, LTR-isolated reference shown next to the property name. */
export function PropertyReference({ option }: { option: PropertyOption }) {
  const t = useT();
  const reference = option.code ?? option.deed_number;
  if (!reference) {
    return <span className="text-xs text-muted-foreground">{t("projects.propertyNoReference")}</span>;
  }
  return (
    <span className="text-xs text-muted-foreground">
      {option.code ? t("projects.propertyCode") : t("projects.propertyDeedNumber")}:{" "}
      <bdi dir="ltr" className="font-mono tabular-nums text-foreground">
        {toLatinDigits(reference)}
      </bdi>
    </span>
  );
}

export function PropertyPicker({
  entityId,
  value,
  onSelect,
  onClear,
}: {
  entityId: string;
  value: PropertyOption | null;
  onSelect: (option: PropertyOption) => void;
  onClear: () => void;
}) {
  const t = useT();
  const [open, setOpen] = React.useState(false);
  const [term, setTerm] = React.useState("");
  const [debounced, setDebounced] = React.useState("");
  const search = useServerFn(searchLinkableProperties);

  React.useEffect(() => {
    const id = window.setTimeout(() => setDebounced(term.trim()), 250);
    return () => window.clearTimeout(id);
  }, [term]);

  const query = useQuery({
    queryKey: ["linkable-properties", entityId, debounced],
    queryFn: () => search({ data: { entityId, query: debounced || undefined } }),
    enabled: open,
    staleTime: 30_000,
  });

  const options = query.data ?? [];

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              role="combobox"
              aria-expanded={open}
              className="min-h-11 flex-1 justify-between gap-2 text-start font-normal"
            >
              <span className="flex min-w-0 items-center gap-2">
                <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="truncate">{value ? value.name : t("projects.linkPropertyPlaceholder")}</span>
              </span>
              <ChevronsUpDown className="size-4 shrink-0 opacity-50" aria-hidden="true" />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            className="w-[min(28rem,calc(100vw-2rem))] p-0"
          >
            <Command shouldFilter={false}>
              <CommandInput
                value={term}
                onValueChange={setTerm}
                placeholder={t("projects.propertySearchPlaceholder")}
              />
              <CommandList className="max-h-64">
                {query.isLoading ? (
                  <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                    {t("common.loading")}
                  </div>
                ) : query.isError ? (
                  <div className="space-y-2 px-3 py-6 text-center text-sm text-muted-foreground">
                    <p>{t("projects.propertySearchFailed")}</p>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="min-h-9"
                      onClick={() => void query.refetch()}
                    >
                      {t("common.retry")}
                    </Button>
                  </div>
                ) : (
                  <>
                    <CommandEmpty>{t("projects.propertySearchEmpty")}</CommandEmpty>
                    <CommandGroup>
                      {options.map((option) => (
                        <CommandItem
                          key={option.id}
                          value={option.id}
                          onSelect={() => {
                            onSelect(option);
                            setOpen(false);
                          }}
                          className="items-start gap-2 py-2"
                        >
                          <Check
                            className={cn(
                              "mt-0.5 size-4 shrink-0",
                              value?.id === option.id ? "opacity-100" : "opacity-0",
                            )}
                            aria-hidden="true"
                          />
                          <span className="flex min-w-0 flex-col">
                            <span className="truncate text-sm font-medium text-foreground">
                              {option.name}
                            </span>
                            <PropertyReference option={option} />
                          </span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </>
                )}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        {value ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-11 shrink-0"
            onClick={onClear}
            aria-label={t("projects.propertyClear")}
          >
            <X className="size-4" aria-hidden="true" />
          </Button>
        ) : null}
      </div>
    </div>
  );
}
