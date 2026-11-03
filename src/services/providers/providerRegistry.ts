// Provider Registry
// Manages charging network providers, active provider selection, and operational mode.

import { IChargingNetworkProvider, DataSourceType } from './providerTypes';
import { MockOcpiProvider } from './mock/mockOcpiProvider';

export class ProviderRegistry {
  private providers = new Map<string, IChargingNetworkProvider>();
  private activeProviderId: string | null = null;
  private isLiveModeEnabled: boolean = false;

  constructor() {
    // Register standard deterministic mock provider by default
    const defaultMock = new MockOcpiProvider();
    this.registerProvider(defaultMock);
    this.activeProviderId = defaultMock.providerId;
  }

  registerProvider(provider: IChargingNetworkProvider): void {
    this.providers.set(provider.providerId, provider);
    if (!this.activeProviderId) {
      this.activeProviderId = provider.providerId;
    }
  }

  getProvider(providerId: string): IChargingNetworkProvider | undefined {
    return this.providers.get(providerId);
  }

  getActiveProvider(): IChargingNetworkProvider | null {
    if (!this.activeProviderId) return null;
    return this.providers.get(this.activeProviderId) || null;
  }

  setActiveProvider(providerId: string): boolean {
    if (this.providers.has(providerId)) {
      this.activeProviderId = providerId;
      const prov = this.providers.get(providerId);
      this.isLiveModeEnabled = prov?.sourceType === 'live_provider';
      return true;
    }
    return false;
  }

  listProviders(): {
    providerId: string;
    providerName: string;
    protocol: string;
    sourceType: DataSourceType;
    isActive: boolean;
  }[] {
    return Array.from(this.providers.values()).map((p) => ({
      providerId: p.providerId,
      providerName: p.providerName,
      protocol: p.protocol,
      sourceType: p.sourceType,
      isActive: p.providerId === this.activeProviderId
    }));
  }

  isLiveMode(): boolean {
    return this.isLiveModeEnabled;
  }

  setLiveMode(enabled: boolean): void {
    this.isLiveModeEnabled = enabled;
  }
}

// Global singleton instance
export const globalProviderRegistry = new ProviderRegistry();

