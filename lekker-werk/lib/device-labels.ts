// UI labels for clock hardware. Shared by the devices page, employee profile and dashboard.

export const DEVICE_KIND_LABEL = {
  RFID_READER: "RFID card reader",
  NFC_READER: "NFC reader",
  BIOMETRIC: "Biometric scanner",
  KIOSK: "Kiosk / tablet",
  OTHER: "Other terminal",
} as const;

export const CREDENTIAL_KIND_LABEL = {
  RFID_CARD: "RFID card",
  NFC_TAG: "NFC tag",
  PIN: "PIN",
  BIOMETRIC_ID: "Fingerprint / face id",
  BARCODE: "Barcode badge",
} as const;

/** How a clock event arrived, for activity feeds and history tables. */
export function sourceLabel(source: string, deviceName?: string | null) {
  switch (source) {
    case "TELEGRAM":
      return "Telegram";
    case "WHATSAPP":
      return "WhatsApp";
    case "DEVICE":
      return deviceName ?? "Clock device";
    case "MANUAL_CORRECTION":
      return "Manager correction";
    case "WEB":
      return "Web";
    default:
      return source.toLowerCase();
  }
}

export const SHOP_CATEGORY_LABEL = {
  RFID: "RFID cards & bands",
  TABLET: "Tablets & kiosks",
  MOUNT: "Stands & mounts",
  NFC: "NFC tags",
  BIOMETRIC: "Biometric",
  OTHER: "Other",
} as const;

export const SHOP_ORDER_STATUS_LABEL = {
  PENDING_PAYMENT: "Awaiting payment",
  PAID: "Paid · preparing",
  SHIPPED: "Shipped",
  CANCELLED: "Cancelled",
} as const;

/** Cents → "R 1 299.00" */
export function formatRand(cents: number) {
  return `R ${(cents / 100).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
