import type { ClockAction, RejectionReasonCode } from "./types";

export const REJECTION_MESSAGES: Record<RejectionReasonCode, string> = {
  EMPLOYEE_INACTIVE: "Your employee profile is not active. Please contact your manager.",
  ACCOUNT_NOT_LINKED: "This chat is not linked to an employee yet. Send: LINK <your code>.",
  WRONG_COMPANY: "This request is not valid for your company.",
  QR_INVALID: "Please scan the QR code at your workplace to clock.",
  QR_DISABLED: "This QR code has been disabled. Ask your manager for a new one.",
  QR_EXPIRED: "This QR code has expired. Ask your manager for a new one.",
  NOT_ALLOWED_AT_LOCATION: "You are not set up to clock at this location.",
  GPS_REQUIRED: "Please share your live location so we can confirm you are on site.",
  OUTSIDE_RADIUS: "You seem to be too far from the workplace to clock.",
  ALREADY_CLOCKED_IN: "You are already clocked in.",
  NOT_CLOCKED_IN: "You are not clocked in.",
  ALREADY_ON_BREAK: "You are on a break. End your break first.",
  NOT_ON_BREAK: "You are not on a break.",
  DUPLICATE: "That was already recorded a moment ago.",
  CLOCKING_NOT_ALLOWED: "This action is not enabled for your company.",
  RATE_LIMITED: "Too many attempts. Please wait a minute and try again.",
  SUBSCRIPTION_INACTIVE: "Clocking is paused because your company's subscription is inactive. Please tell your manager.",
  CREDENTIAL_UNKNOWN: "Card or PIN not recognised. Please see your manager.",
  DEVICE_DISABLED: "This clock terminal is disabled.",
  TIMESTAMP_OUT_OF_RANGE: "The device clock is out of range. Please check the terminal's date and time.",
};

export const ACTION_VERB: Record<ClockAction, string> = {
  CLOCK_IN: "clocked in",
  CLOCK_OUT: "clocked out",
  BREAK_START: "started your break",
  BREAK_END: "ended your break",
};
