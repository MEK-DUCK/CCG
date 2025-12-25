/**
 * Centralized load port configuration.
 * This mirrors the backend config and can be fetched from /api/config/load-ports.
 */

export interface LoadPort {
  code: string;
  name: string;
  short_name: string;
  order: number;
  active: boolean;
}

// Default load ports - used as fallback if API call fails
const DEFAULT_LOAD_PORTS: LoadPort[] = [
  { code: 'MAA', name: 'Mina Al Ahmadi', short_name: 'MAA', order: 1, active: true },
  { code: 'MAB', name: 'Mina Abdullah', short_name: 'MAB', order: 2, active: true },
  { code: 'SHU', name: 'Shuaiba', short_name: 'SHU', order: 3, active: true },
  { code: 'ZOR', name: 'Az-Zour', short_name: 'ZOR', order: 4, active: true },
];

// Mutable state - can be updated from API
let LOAD_PORTS: LoadPort[] = [...DEFAULT_LOAD_PORTS];

/**
 * Get all load ports.
 */
export const getLoadPorts = (): LoadPort[] => LOAD_PORTS;

/**
 * Get load port codes as array.
 */
export const getLoadPortCodes = (): string[] => LOAD_PORTS.map(p => p.code);

/**
 * Get load port codes as readonly tuple for TypeScript const assertions.
 */
export const LOAD_PORT_OPTIONS = ['MAA', 'MAB', 'SHU', 'ZOR'] as const;
export type LoadPortCode = typeof LOAD_PORT_OPTIONS[number];

/**
 * Check if a port code is valid.
 */
export const isValidLoadPort = (code: string): boolean => 
  LOAD_PORTS.some(p => p.code === code.toUpperCase());

/**
 * Get port name by code.
 */
export const getPortName = (code: string): string => {
  const port = LOAD_PORTS.find(p => p.code === code.toUpperCase());
  return port?.name || code;
};

/**
 * Initialize config from API.
 * Call this on app startup to sync with backend.
 */
export async function initializeLoadPorts(): Promise<void> {
  try {
    const response = await fetch('/api/config/load-ports');
    if (response.ok) {
      const data = await response.json();
      if (data.ports && Array.isArray(data.ports)) {
        LOAD_PORTS = data.ports;
        console.log('Load ports initialized from API:', LOAD_PORTS.length);
      }
    }
  } catch (error) {
    console.warn('Failed to fetch load ports config, using defaults:', error);
  }
}

// Port operation statuses
export const PORT_OPERATION_STATUSES = ['Planned', 'Loading', 'Completed Loading'] as const;
export type PortOperationStatusType = typeof PORT_OPERATION_STATUSES[number];

