import * as React from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Clock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * منتقي تاريخ/وقت ميلادي داخل التطبيق.
 *
 * سبب وجوده: حقول `<input type="date">` و`datetime-local` الأصلية تعرض على iOS
 * وAndroid أرقامًا عربية/هندية بحسب لغة الجهاز. هذا المكوّن يرسم التقويم بنفسه
 * فلا يمر أي رقم عبر تنسيق محلي: كل الأرقام تُبنى من سلاسل ASCII 0-9، وأسماء
 * الأشهر والأيام عربية ثابتة.
 *
 * القيمة المتبادلة دائمًا ميلادية بصيغة ISO: `YYYY-MM-DD` أو `YYYY-MM-DDTHH:mm`.
 */

const MONTHS_AR = [
  "يناير",
  "فبراير",
  "مارس",
  "أبريل",
  "مايو",
  "يونيو",
  "يوليو",
  "أغسطس",
  "سبتمبر",
  "أكتوبر",
  "نوفمبر",
  "ديسمبر",
] as const;

/** السبت أولًا كما هو معتاد في التقويم العربي. */
const WEEKDAYS_AR = ["السبت", "الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة"];
const WEEKDAYS_SHORT_AR = ["س", "ح", "ن", "ث", "ر", "خ", "ج"];

/** أرقام لاتينية مضمونة: لا Intl ولا toLocaleString في أي مكان هنا. */
export function pad2(n: number): string {
  return (n < 10 ? "0" : "") + String(n);
}

export const ISO_DATE_RE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;
export const ISO_DATETIME_LOCAL_RE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}$/;

/** يحتوي النص أي رقم غير لاتيني (عربي-هندي ٠-٩ أو فارسي ۰-۹)؟ */
export function hasNonLatinDigits(value: string): boolean {
  return /[\u0660-\u0669\u06F0-\u06F9]/.test(value);
}

function partsOf(iso: string): { y: number; m: number; d: number } | null {
  if (!ISO_DATE_RE.test(iso)) return null;
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  const d = Number(iso.slice(8, 10));
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return { y, m, d };
}

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** موضع اليوم الأول ضمن أسبوع يبدأ بالسبت. */
function firstWeekdayOffset(y: number, m: number): number {
  const jsDay = new Date(Date.UTC(y, m - 1, 1)).getUTCDay(); // 0=الأحد
  return (jsDay + 1) % 7;
}

/** عرض تاريخ ISO بالعربية مع أرقام لاتينية حصرًا. */
export function formatLatinDate(iso: string): string {
  const p = partsOf(iso);
  if (!p) return "";
  return `${String(p.d)} ${MONTHS_AR[p.m - 1]} ${String(p.y)}`;
}

function CalendarGrid({
  value,
  onSelect,
  minIso,
}: {
  value: string;
  onSelect: (iso: string) => void;
  minIso?: string | undefined;
}) {
  const today = new Date();
  const selected = partsOf(value);
  const [view, setView] = React.useState(() => ({
    y: selected?.y ?? today.getFullYear(),
    m: selected?.m ?? today.getMonth() + 1,
  }));

  const total = daysInMonth(view.y, view.m);
  const offset = firstWeekdayOffset(view.y, view.m);
  const cells: Array<number | null> = [
    ...Array.from({ length: offset }, () => null),
    ...Array.from({ length: total }, (_, i) => i + 1),
  ];

  const shift = (delta: number) =>
    setView((v) => {
      const raw = v.m - 1 + delta;
      return { y: v.y + Math.floor(raw / 12), m: ((raw % 12) + 12) % 12 + 1 };
    });

  return (
    <div className="w-[17.5rem] select-none" dir="rtl">
      <div className="mb-3 flex items-center justify-between gap-2">
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label="الشهر السابق"
          onClick={() => shift(-1)}
        >
          <ChevronRight className="size-4" aria-hidden="true" />
        </Button>
        <div className="flex items-center gap-2 text-sm font-semibold">
          <span>{MONTHS_AR[view.m - 1]}</span>
          <span dir="ltr" className="tabular-nums">
            {String(view.y)}
          </span>
        </div>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label="الشهر التالي"
          onClick={() => shift(1)}
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
        </Button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-[0.7rem] text-muted-foreground">
        {WEEKDAYS_SHORT_AR.map((d, i) => (
          <abbr key={d} title={WEEKDAYS_AR[i]} className="no-underline">
            {d}
          </abbr>
        ))}
      </div>

      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((day, i) => {
          if (day === null) return <span key={`e-${i}`} />;
          const iso = `${String(view.y)}-${pad2(view.m)}-${pad2(day)}`;
          const isSelected = iso === value;
          const disabled = Boolean(minIso && iso < minIso);
          return (
            <button
              key={iso}
              type="button"
              disabled={disabled}
              onClick={() => onSelect(iso)}
              className={cn(
                "flex h-9 items-center justify-center rounded-md text-sm tabular-nums transition-colors",
                isSelected
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-secondary hover:text-primary",
                disabled && "cursor-not-allowed opacity-35 hover:bg-transparent",
              )}
              aria-pressed={isSelected}
            >
              <span dir="ltr">{String(day)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export type LatinDatePickerProps = {
  id?: string;
  /** `YYYY-MM-DD` أو سلسلة فارغة. */
  value: string;
  onChange: (iso: string) => void;
  /** أقل تاريخ مسموح `YYYY-MM-DD`. */
  min?: string;
  placeholder?: string;
  invalid?: boolean;
  className?: string;
};

export function LatinDatePicker({
  id,
  value,
  onChange,
  min,
  placeholder = "اختر التاريخ",
  invalid,
  className,
}: LatinDatePickerProps) {
  const [open, setOpen] = React.useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          aria-invalid={invalid ?? false}
          className={cn(
            "min-h-11 w-full justify-between gap-2 font-normal",
            !value && "text-muted-foreground",
            className,
          )}
        >
          <span>{value ? formatLatinDate(value) : placeholder}</span>
          <CalendarDays className="size-4 shrink-0 opacity-70" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-3">
        <CalendarGrid
          value={value}
          {...(min ? { minIso: min } : {})}
          onSelect={(iso) => {
            onChange(iso);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

export type LatinDateTimePickerProps = {
  id?: string;
  /** `YYYY-MM-DDTHH:mm` أو سلسلة فارغة. */
  value: string;
  onChange: (value: string) => void;
  min?: string;
  invalid?: boolean;
  /** خطوة الدقائق في القائمة. */
  minuteStep?: number;
};

/**
 * تاريخ + وقت بلا `datetime-local`: التقويم أعلاه وقائمتا ساعة/دقيقة بأرقام
 * لاتينية. لا يحدث أي انزياح يوم/ساعة لأن القيمة نصية محلية ولا تمر بأي
 * تحويل منطقة زمنية في المتصفح؛ التحويل إلى UTC يتم على الخادم بتوقيت الرياض.
 */
export function LatinDateTimePicker({
  id,
  value,
  onChange,
  min,
  invalid,
  minuteStep = 5,
}: LatinDateTimePickerProps) {
  const datePart = value.slice(0, 10);
  const hour = value.length >= 16 ? value.slice(11, 13) : "";
  const minute = value.length >= 16 ? value.slice(14, 16) : "";

  const emit = (d: string, h: string, m: string) => {
    if (!d) return onChange("");
    onChange(`${d}T${h || "09"}:${m || "00"}`);
  };

  const selectClass =
    "h-11 w-full rounded-md border border-input bg-background px-3 text-sm tabular-nums";

  return (
    <div className="space-y-2">
      <LatinDatePicker
        {...(id ? { id } : {})}
        value={datePart}
        onChange={(iso) => emit(iso, hour, minute)}
        {...(min ? { min } : {})}
        {...(invalid === undefined ? {} : { invalid })}
        placeholder="اختر تاريخ الموعد"
      />
      <div className="flex items-center gap-2" dir="ltr">
        <Clock className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <select
          aria-label="الساعة"
          className={selectClass}
          value={hour}
          onChange={(e) => emit(datePart, e.target.value, minute || "00")}
        >
          <option value="">--</option>
          {Array.from({ length: 24 }, (_, h) => pad2(h)).map((h) => (
            <option key={h} value={h}>
              {h}
            </option>
          ))}
        </select>
        <span aria-hidden="true" className="text-muted-foreground">
          :
        </span>
        <select
          aria-label="الدقيقة"
          className={selectClass}
          value={minute}
          onChange={(e) => emit(datePart, hour || "09", e.target.value)}
        >
          <option value="">--</option>
          {Array.from({ length: Math.floor(60 / minuteStep) }, (_, i) => pad2(i * minuteStep)).map(
            (m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ),
          )}
        </select>
      </div>
      <p className="text-xs text-muted-foreground">
        الوقت بنظام أربع وعشرين ساعة بتوقيت الرياض، والأرقام لاتينية 0-9.
      </p>
    </div>
  );
}
