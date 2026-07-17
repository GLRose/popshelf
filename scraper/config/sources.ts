// The registry. Adding a new IP is (ideally) an entry in IP_CONFIGS; adding a
// new source is one entry in ADAPTERS plus its adapter file. Nothing else in
// the pipeline changes. This file is the only place that knows which sources
// feed which IPs.
import type { IpConfig, SourceAdapter } from '../core/types';
import { stubAdapter } from '../adapters/stub';
import { popmartAdapter } from '../adapters/popmart';

const ADAPTERS: readonly SourceAdapter[] = [stubAdapter, popmartAdapter];

export function getAdapter(name: string): SourceAdapter {
  const adapter = ADAPTERS.find((a) => a.name === name);
  if (!adapter) {
    throw new Error(
      `No adapter registered named "${name}". Registered: ${ADAPTERS.map((a) => a.name).join(', ')}`,
    );
  }
  return adapter;
}

export const IP_CONFIGS: readonly IpConfig[] = [
  // Verification-only IP: exercises the pipeline end to end with no network.
  {
    ip: 'stub',
    label: 'Stub',
    accent: '#8A7BF0',
    sources: [{ source: 'stub' }],
  },
  {
    ip: 'dimoo',
    label: 'DIMOO',
    accent: '#4A9DD9',
    sources: [{ source: 'popmart', options: { brandLabel: 'DIMOO' } }],
  },
  {
    ip: 'hirono',
    label: 'HIRONO',
    accent: '#5B6B8C',
    sources: [{ source: 'popmart', options: { brandLabel: 'HIRONO' } }],
  },
];

export function getIpConfig(ip: string): IpConfig {
  const config = IP_CONFIGS.find((c) => c.ip === ip);
  if (!config) {
    throw new Error(
      `No IP configured for "${ip}". Configured: ${IP_CONFIGS.map((c) => c.ip).join(', ')}`,
    );
  }
  return config;
}
