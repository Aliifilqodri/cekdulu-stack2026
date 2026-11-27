import type { GatewayMode } from "../config/env";

export interface IncomingWaMessage {
  fromPhone: string;
  text?: string;
  location?: {
    latitude: number;
    longitude: number;
    name?: string;
  };
  sessionId?: string;
}

export interface OutboundWaRecord {
  toPhone: string;
  text: string;
  sessionId: string;
  sentAt: string;
  deliveredVia: GatewayMode;
}

export interface WaGatewayStatus {
  mode: GatewayMode;
  sessionId: string;
  connected: boolean;
  pairedPhone?: string | null;
  notes?: string;
}

export interface WaGatewayAdapter {
  readonly mode: GatewayMode;
  readonly sessionId: string;
  start(): Promise<void>;
  stop(): Promise<void>;
  getStatus(): WaGatewayStatus;
  sendMessage(toPhone: string, text: string): Promise<OutboundWaRecord>;
  setIncomingHandler?(handler: (msg: IncomingWaMessage) => Promise<unknown>): void;
}
