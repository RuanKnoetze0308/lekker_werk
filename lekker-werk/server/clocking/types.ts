export type ClockAction = "CLOCK_IN" | "CLOCK_OUT" | "BREAK_START" | "BREAK_END";
/** AUTO lets the engine pick the next logical action from the employee's state (card taps). */
export type RequestedAction = ClockAction | "AUTO";
export type ClockSourceType = "TELEGRAM" | "WHATSAPP" | "WEB" | "DEVICE";
export type ClockState = "OUT" | "IN" | "BREAK";
export type CredentialKind = "RFID_CARD" | "NFC_TAG" | "PIN" | "BIOMETRIC_ID" | "BARCODE";

export type RejectionReasonCode =
  | "EMPLOYEE_INACTIVE"
  | "ACCOUNT_NOT_LINKED"
  | "WRONG_COMPANY"
  | "QR_INVALID"
  | "QR_DISABLED"
  | "QR_EXPIRED"
  | "NOT_ALLOWED_AT_LOCATION"
  | "GPS_REQUIRED"
  | "OUTSIDE_RADIUS"
  | "ALREADY_CLOCKED_IN"
  | "NOT_CLOCKED_IN"
  | "ALREADY_ON_BREAK"
  | "NOT_ON_BREAK"
  | "DUPLICATE"
  | "CLOCKING_NOT_ALLOWED"
  | "RATE_LIMITED"
  | "SUBSCRIPTION_INACTIVE"
  | "CREDENTIAL_UNKNOWN"
  | "DEVICE_DISABLED"
  | "TIMESTAMP_OUT_OF_RANGE";

/**
 * How the person clocking proved who they are. Each kind has one resolver in identity.ts.
 * A new clock-in method either reuses one of these (a new card technology is just a new
 * CredentialKind) or adds a kind + resolver. Nothing else in the engine changes.
 */
export type ClockIdentity =
  /** Already authenticated by the caller (admin web action, server-side tooling). */
  | { kind: "EMPLOYEE"; employeeId: string }
  /** A verified Telegram chat / WhatsApp number linked to an employee. */
  | { kind: "CHAT"; channel: "TELEGRAM" | "WHATSAPP"; externalId: string }
  /** Something presented to a device: card UID, PIN, fingerprint template id... */
  | { kind: "CREDENTIAL"; credentialKind: CredentialKind; value: string };

/**
 * The only way anything records attendance. Adapters (chat, device API, web) translate their
 * transport into this shape; the engine owns every rule.
 * companyId must be derived server-side (webhook secret / device key / session), never from input.
 */
export interface ClockRequest {
  companyId: string;
  action: RequestedAction;
  source: ClockSourceType;
  identity: ClockIdentity;
  /** Set by the device adapter after authenticating the terminal. Pins the location. */
  device?: { id: string; locationId: string };
  qrToken?: string;
  latitude?: number;
  longitude?: number;
  idempotencyKey?: string;
  /**
   * When the punch physically happened, as reported by a trusted device that buffered it while
   * offline. Only honoured for DEVICE sources, and only within a bounded window (see engine).
   */
  capturedAt?: Date;
  /** Server receipt time. Defaults to the real clock; overridable for simulations and tests. */
  now?: Date;
}

export interface ClockResult {
  ok: boolean;
  reason?: RejectionReasonCode;
  message: string;
  state?: ClockState;
  employee?: { id: string; firstName: string };
  event?: { id: string; eventType: ClockAction; occurredAt: Date; locationName: string; timezone: string };
}
