declare module "qrcode" {
  export function create(
    data: string,
    options?: { errorCorrectionLevel?: "L" | "M" | "Q" | "H" },
  ): { modules: { size: number; data: Uint8Array } };
  const QRCode: {
    create: typeof create;
  };
  export default QRCode;
}

declare module "arabic-persian-reshaper" {
  export const ArabicShaper: {
    convertArabic(text: string): string;
    convertArabicBack(text: string): string;
  };
  export const PersianShaper: {
    convertArabic(text: string): string;
  };
}
