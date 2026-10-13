export type ChannelKind = "TELEGRAM" | "WHATSAPP";

/** Channel-neutral inbound message. The rest of the app never sees Telegram/WhatsApp payloads. */
export interface InboundMessage {
  companyId: string;
  channel: ChannelKind;
  /** Telegram chat id / WhatsApp wa_id */
  externalId: string;
  displayName?: string;
  /** Provider message id, used to drop webhook retries. */
  messageId?: string;
  /** Free text, or the id of a tapped button. */
  text?: string;
  location?: { latitude: number; longitude: number };
}

export interface OutboundButton {
  id: string;
  label: string;
}

export interface OutboundMessage {
  text: string;
  buttons?: OutboundButton[];
  /** Ask the user to share their live location (for GPS validation). */
  requestLocation?: boolean;
}

export interface ChannelSender {
  send(externalId: string, message: OutboundMessage): Promise<void>;
}
