import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ClientOnly } from "@tanstack/react-router";
import { MapPin, Pencil, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ResponsiveModal, TextField, TextAreaField } from "@/components/rakeez";
import { Num } from "@/components/rakeez/numeric";
import {
  getProjectLocation,
  savePropertyLocation,
  saveProjectLocation,
  suggestProjectLocation,
  type LocationBoundary,
} from "@/lib/project-location.functions";

const MapPicker = React.lazy(() => import("./map-picker"));

type Ring = [number, number][];

const ringToBoundary = (ring: Ring): LocationBoundary => {
  if (ring.length < 3) return null;
  const first = ring[0]!;
  const closed: Ring = [...ring, first];
  return { type: "Polygon", coordinates: [closed] };
};

const clampText = (value: string) => value.slice(0, 400);

/**
 * The single precise-location surface: a compact read block plus the editor.
 * It always edits the one stored record for the project (or its linked
 * property) — nothing is duplicated between the project and the property.
 */
export function PreciseLocationSection({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const fetchLocation = useServerFn(getProjectLocation);
  const fetchSuggestions = useServerFn(suggestProjectLocation);
  const saveForProject = useServerFn(saveProjectLocation);
  const saveForProperty = useServerFn(savePropertyLocation);

  const [open, setOpen] = React.useState(false);
  const [address, setAddress] = React.useState("");
  const [lat, setLat] = React.useState<number | null>(null);
  const [lng, setLng] = React.useState<number | null>(null);
  const [ring, setRing] = React.useState<Ring>([]);
  const [drawing, setDrawing] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);

  const locationQuery = useQuery({
    queryKey: ["project-location", projectId],
    queryFn: () => fetchLocation({ data: { projectId } }),
  });
  const suggestionsQuery = useQuery({
    queryKey: ["project-location-suggestions", projectId],
    queryFn: () => fetchSuggestions({ data: { projectId } }),
    enabled: open,
  });

  const loc = locationQuery.data;

  const openEditor = () => {
    setAddress(loc?.address ?? "");
    setLat(loc?.lat ?? null);
    setLng(loc?.lng ?? null);
    const saved = loc?.boundary?.coordinates?.[0] ?? null;
    setRing(saved ? (saved.slice(0, -1) as Ring) : []);
    setDrawing(false);
    setFormError(null);
    setOpen(true);
  };

  const mutation = useMutation({
    mutationFn: async () => {
      const boundary = ring.length >= 3 ? ringToBoundary(ring) : null;
      const payload = {
        address: address.trim(),
        lat: lat as number,
        lng: lng as number,
        boundary,
      };
      if (loc?.property_id) {
        await saveForProperty({ data: { propertyId: loc.property_id, ...payload } });
      } else {
        await saveForProject({ data: { projectId, ...payload } });
      }
    },
    onSuccess: () => {
      toast.success("تم حفظ الموقع الدقيق");
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["project-location", projectId] });
      void queryClient.invalidateQueries({ queryKey: ["project-overview", projectId] });
    },
    onError: () => toast.error("تعذّر حفظ الموقع. تأكد من العنوان والنقطة وحاول مرة أخرى."),
  });

  const submit = () => {
    const trimmed = address.trim();
    if (trimmed.length < 3) {
      setFormError("اكتب عنوانًا وصفيًا للموقع.");
      return;
    }
    if (lat == null || lng == null) {
      setFormError("حدّد نقطة الموقع على الخريطة.");
      return;
    }
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      setFormError("الإحداثيات غير صالحة.");
      return;
    }
    setFormError(null);
    mutation.mutate();
  };

  if (locationQuery.isLoading) {
    return <div className="h-16 w-full animate-pulse rounded-xl border border-border bg-muted/40" />;
  }
  if (!loc?.visible) {
    return (
      <div className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground shadow-card">
        الموقع الدقيق محجوب — لا تملك صلاحية الاطلاع عليه.
      </div>
    );
  }

  const complete = loc.complete;

  return (
    <section
      aria-label="الموقع الدقيق"
      className="rounded-xl border border-border bg-card px-4 py-3 shadow-card"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary">
          <MapPin className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">الموقع الدقيق</p>
          {complete ? (
            <p className="truncate text-sm text-muted-foreground" title={loc.address ?? ""}>
              {loc.address}
            </p>
          ) : (
            <p className="inline-flex items-center gap-1 text-sm font-medium text-destructive">
              <AlertTriangle className="size-4" aria-hidden="true" />
              الموقع مطلوب — لا تكتمل المرحلة الأولى بدونه
            </p>
          )}
        </div>
        <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
          {loc.has_boundary ? "حدود محفوظة" : "بلا حدود"}
        </span>
        {complete && loc.lat != null && loc.lng != null ? (
          <a
            className="inline-flex min-h-9 items-center rounded-md border border-border px-3 text-xs font-medium text-primary"
            href={`https://www.openstreetmap.org/?mlat=${loc.lat}&mlon=${loc.lng}#map=17/${loc.lat}/${loc.lng}`}
            target="_blank"
            rel="noreferrer"
          >
            فتح الخريطة
          </a>
        ) : null}
        {loc.can_edit ? (
          <Button type="button" size="sm" className="min-h-9" onClick={openEditor}>
            <Pencil className="size-4" aria-hidden="true" />
            {complete ? "تعديل" : "إضافة الموقع"}
          </Button>
        ) : null}
      </div>

      {complete && loc.lat != null && loc.lng != null ? (
        <p className="mt-2 text-xs text-muted-foreground">
          <Num>{loc.lat.toFixed(6)}</Num> , <Num>{loc.lng.toFixed(6)}</Num>
        </p>
      ) : null}

      <ResponsiveModal
        open={open}
        onOpenChange={setOpen}
        title="الموقع الدقيق"
        description="حدّد النقطة على الخريطة واكتب العنوان. رسم الحدود اختياري."
        className="sm:max-w-2xl"
        footer={
          <div className="flex w-full flex-wrap justify-end gap-2">
            <Button type="button" variant="ghost" className="min-h-11" onClick={() => setOpen(false)}>
              إلغاء
            </Button>
            <Button
              type="button"
              className="min-h-11"
              onClick={submit}
              disabled={mutation.isPending}
            >
              {mutation.isPending ? "جارٍ الحفظ…" : "حفظ الموقع"}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {(suggestionsQuery.data ?? []).length > 0 ? (
            <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
              <p className="text-xs font-semibold text-foreground">
                اقتراحات من تحليل الصك/الرخصة (لا تُعتمد تلقائيًا)
              </p>
              {(suggestionsQuery.data ?? []).map((s, i) => (
                <div key={`sug-${i}`} className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">
                    {s.address ?? "بلا عنوان"}
                    {s.lat != null && s.lng != null ? (
                      <>
                        {" · "}
                        <Num>{s.lat.toFixed(6)}</Num>,{" "}
                        <Num>{s.lng.toFixed(6)}</Num>
                      </>
                    ) : null}
                  </span>
                  <span className="rounded-full bg-background px-2 py-0.5">
                    المصدر: {s.source}
                    {s.confidence != null ? (
                      <>
                        {" · الثقة "}
                        <Num>{Math.round(s.confidence * (s.confidence <= 1 ? 100 : 1))}</Num>%
                      </>
                    ) : null}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="min-h-9"
                    onClick={() => {
                      if (s.address) setAddress(clampText(s.address));
                      if (s.lat != null) setLat(s.lat);
                      if (s.lng != null) setLng(s.lng);
                    }}
                  >
                    مراجعة واعتماد
                  </Button>
                </div>
              ))}
            </div>
          ) : null}

          <TextAreaField
            id="precise-address"
            label="العنوان الدقيق"
            value={address}
            onChange={(e) => setAddress(clampText(e.target.value))}
          />

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant={drawing ? "default" : "outline"}
              className="min-h-9"
              onClick={() => setDrawing((v) => !v)}
            >
              {drawing ? "إنهاء رسم الحدود" : "رسم الحدود (اختياري)"}
            </Button>
            {ring.length > 0 ? (
              <>
                <span className="text-xs text-muted-foreground">
                  النقاط: <Num>{ring.length}</Num>
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="min-h-9"
                  onClick={() => setRing([])}
                >
                  مسح الحدود
                </Button>
              </>
            ) : null}
            <p className="w-full text-xs text-muted-foreground">
              {drawing
                ? "انقر على الخريطة لإضافة نقاط الحدود."
                : "انقر على الخريطة لتحديد نقطة الموقع."}
            </p>
          </div>

          <ClientOnly
            fallback={<div className="h-64 w-full animate-pulse rounded-xl bg-muted/40 sm:h-80" />}
          >
            <React.Suspense
              fallback={<div className="h-64 w-full animate-pulse rounded-xl bg-muted/40 sm:h-80" />}
            >
              <MapPicker
                lat={lat}
                lng={lng}
                boundary={ring.length >= 3 ? ringToBoundary(ring) : null}
                editable
                drawing={drawing}
                onPick={(la, ln) => {
                  setLat(la);
                  setLng(ln);
                }}
                onDrawPoint={(la, ln) => setRing((prev) => [...prev, [ln, la]])}
              />
            </React.Suspense>
          </ClientOnly>

          <div className="grid gap-3 sm:grid-cols-2">
            <TextField
              id="precise-lat"
              label="خط العرض"
              dir="ltr"
              inputMode="decimal"
              value={lat == null ? "" : String(lat)}
              onChange={(e) => {
                const v = Number(e.target.value);
                setLat(e.target.value.trim() === "" || Number.isNaN(v) ? null : v);
              }}
            />
            <TextField
              id="precise-lng"
              label="خط الطول"
              dir="ltr"
              inputMode="decimal"
              value={lng == null ? "" : String(lng)}
              onChange={(e) => {
                const v = Number(e.target.value);
                setLng(e.target.value.trim() === "" || Number.isNaN(v) ? null : v);
              }}
            />
          </div>

          {formError ? (
            <p role="alert" className="text-sm font-medium text-destructive">
              {formError}
            </p>
          ) : null}
        </div>
      </ResponsiveModal>
    </section>
  );
}
