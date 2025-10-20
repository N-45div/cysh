/**
 * Service initialization and dependency injection
 */

import { PublicKey } from '@solana/web3.js';
import { config } from '../config/env';
import { ArciumClient, MagicConnection, Order } from '@shadow-otc/sdk';

export interface Services {
  arcium: ArciumClient;
  magic: MagicConnection;
}

/**
 * Initialize all services
 */
export async function initializeServices(): Promise<Services> {
  // Initialize Arcium client
  const arcium = new ArciumClient({
    rpcUrl: config.solana.rpcUrl,
    clusterOffset: config.arcium.clusterOffset,
    programId: config.arcium.programId 
      ? new PublicKey(config.arcium.programId)
      : new PublicKey('6QFiiqmYBELXw9LgGwogYcwiXkRD6AyGjWtXgoJ3NS3G'), // Default devnet
  });

  // Initialize magicblock connection
  const magic = new MagicConnection({
    routerUrl: config.magicblock.routerUrl,
    routerWsUrl: config.magicblock.routerUrl.replace('https', 'wss'),
    erUrl: config.magicblock.erUrl,
    solanaUrl: config.solana.rpcUrl,
    validator: new PublicKey('11111111111111111111111111111111'), // Placeholder validator
  });

  console.log('✅ Services initialized');
  console.log('  - Arcium program:', config.arcium.programId || '6QFiiqmYBELXw9LgGwogYcwiXkRD6AyGjWtXgoJ3NS3G');
  console.log('  - magicblock router:', config.magicblock.routerUrl);

  return { arcium, magic };
}

// Extend Grammy context with services
declare module 'grammy' {
  interface Context {
    services?: Services;
  }
}
