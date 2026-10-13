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
