export interface AuthProvider {
  init(config: Record<string, any>): Promise<void>;
  getAuthHeaders(): Promise<Record<string, string>>;
  isValid(): Promise<boolean>;
  refresh(): Promise<void>;
  dispose(): Promise<void>;
  getAuthContext?(): Promise<Record<string, any>>;
}
