import { pgEnum } from "drizzle-orm/pg-core";

export const userRole = pgEnum("user_role", [
  "SUPER_ADMIN",
  "COMPANY_ADMIN",
  "MANAGER",
  "EMPLOYEE",
]);

export const recordStatus = pgEnum("record_status", ["ACTIVE", "INACTIVE"]);

export const channelType = pgEnum("channel_type", ["TELEGRAM", "WHATSAPP"]);

export const clockEventType = pgEnum("clock_event_type", [
  "CLOCK_IN",
  "CLOCK_OUT",
  "BREAK_START",
  "BREAK_END",
]);

export const clockSource = pgEnum("clock_source", [
  "TELEGRAM",
  "WHATSAPP",
  "WEB",
  "MANUAL_CORRECTION",
  "IMPORT",
  // Hardware terminal (RFID/NFC reader, biometric, kiosk). The concrete kind lives on clock_devices.
  "DEVICE",
]);

/** Physical or virtual terminals that submit clock punches over the device API. */
export const deviceKind = pgEnum("device_kind", [
  "RFID_READER",
  "NFC_READER",
  "BIOMETRIC",
  "KIOSK",
  "OTHER",
]);

/** Something an employee presents to a device to identify themselves. */
export const credentialKind = pgEnum("credential_kind", [
  "RFID_CARD",
  "NFC_TAG",
  "PIN",
  "BIOMETRIC_ID",
  "BARCODE",
]);

export const validationStatus = pgEnum("validation_status", [
  "ACCEPTED",
  "REJECTED",
]);

export const qrType = pgEnum("qr_type", [
  "GENERAL",
  "CLOCK_IN",
  "CLOCK_OUT",
  "TEMPORARY",
]);

export const attendanceStatus = pgEnum("attendance_status", [
  "PRESENT",
  "LATE",
  "ABSENT",
  "INCOMPLETE",
  "ON_LEAVE",
  // Scheduled day that is a public holiday and wasn't worked (paid holiday).
  "PUBLIC_HOLIDAY",
  // Site closed (load-shedding, strike, burst pipe...): see site_closures.
  "SITE_CLOSED",
]);

export const payType = pgEnum("pay_type", ["HOURLY", "SALARIED"]);

/** How a leave type builds up: not at all, a slice per month, or a block at each cycle start. */
export const leaveAccrual = pgEnum("leave_accrual", ["NONE", "MONTHLY", "CYCLE_UPFRONT"]);

export const leaveRequestStatus = pgEnum("leave_request_status", [
  "REQUESTED",
  "APPROVED",
  "DECLINED",
  "CANCELLED",
]);

export const leaveSource = pgEnum("leave_source", ["WEB", "TELEGRAM", "WHATSAPP", "MANAGER", "IMPORT"]);

export const leaveLedgerKind = pgEnum("leave_ledger_kind", [
  "OPENING",
  "ACCRUAL",
  "USAGE",
  "REVERSAL",
  "ADJUSTMENT",
  "EXPIRY",
]);

export const payPeriodStatus = pgEnum("pay_period_status", ["OPEN", "LOCKED", "EXPORTED"]);

export const integrationProvider = pgEnum("integration_provider", [
  "CUSTOM_API",
  "SYSPRO",
  "ODOO",
  "SAGE",
  "XERO",
  "QUICKBOOKS",
  "SIMPLEPAY",
  "PAYSPACE",
]);

export const integrationRequestStatus = pgEnum("integration_request_status", [
  "SUBMITTED",
  "REVIEWING",
  "QUOTED",
  "IN_PROGRESS",
  "COMPLETED",
  "DECLINED",
]);

export const integrationCategory = pgEnum("integration_category", [
  "ERP",
  "ACCOUNTING",
  "PAYROLL",
  "HR",
]);

export const syncStatus = pgEnum("sync_status", [
  "QUEUED",
  "RUNNING",
  "SUCCEEDED",
  "FAILED",
]);

export const notificationType = pgEnum("notification_type", [
  "FORGOT_CLOCK_OUT",
  "LATE",
  "ABSENT",
  "EXCESSIVE_OVERTIME",
  "INTEGRATION_FAILED",
  "SYNC_COMPLETED",
  "QR_DISABLED",
  "UNUSUAL_CLOCKING",
  "PAYMENT_FAILED",
  "TRIAL_ENDING",
  "INTEGRATION_REQUESTED",
  "LEAVE_REQUESTED",
  "LEAVE_DECIDED",
]);

export const rejectionReason = pgEnum("rejection_reason", [
  "EMPLOYEE_INACTIVE",
  "ACCOUNT_NOT_LINKED",
  "WRONG_COMPANY",
  "QR_INVALID",
  "QR_DISABLED",
  "QR_EXPIRED",
  "NOT_ALLOWED_AT_LOCATION",
  "GPS_REQUIRED",
  "OUTSIDE_RADIUS",
  "ALREADY_CLOCKED_IN",
  "NOT_CLOCKED_IN",
  "ALREADY_ON_BREAK",
  "NOT_ON_BREAK",
  "DUPLICATE",
  "CLOCKING_NOT_ALLOWED",
  "RATE_LIMITED",
  "SUBSCRIPTION_INACTIVE",
  "CREDENTIAL_UNKNOWN",
  "DEVICE_DISABLED",
  "TIMESTAMP_OUT_OF_RANGE",
  "PERIOD_LOCKED",
]);
