/** What every provider hands back, regardless of ERP: our own internal shape. */
export interface NormalizedHours {
  externalRecordId: string;
  /** Matched against employees.employee_number */
  externalEmployeeRef: string;
  workDate: string; // YYYY-MM-DD
  hours: number;
  raw?: Record<string, unknown>;
}

export interface ProviderSettings {
  config: Record<string, string>;
  credentials: Record<string, string>;
}

export interface IntegrationProviderImpl {
  testConnection(s: ProviderSettings): Promise<void>;
  fetchHours(s: ProviderSettings, range: { from: Date; to: Date }): Promise<NormalizedHours[]>;
}
