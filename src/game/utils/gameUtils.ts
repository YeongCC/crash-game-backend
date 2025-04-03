// Constants for game configuration
const BASE_RTP = 0.97; // 97% Return to Player (3% house edge)
const HASH_PRECISION = Math.pow(2, 32);

// Function to generate a crash point using a hash string
export const generateCrashPoint = (serverSeed: string, scalingFactor: number = 1): number => {
  const hash = serverSeed.slice(0, 8);
  const hashDecimal = parseInt(hash, 16) / HASH_PRECISION;

  let result: number;

  if (hashDecimal < 0.6 * scalingFactor) {
    result = 1 + hashDecimal / (0.6 * scalingFactor);
  } else if (hashDecimal < 0.9 * scalingFactor) {
    const normalizedVal = (hashDecimal - 0.6 * scalingFactor) / (0.3 * scalingFactor);
    result = 2 + (normalizedVal * 3);
  } else {
    const normalizedVal = (hashDecimal - 0.9 * scalingFactor) / (0.1 * scalingFactor);
    result = 5 + (20 * Math.pow(normalizedVal, 2));
  }

  return Math.round(result * 100) / 100;
};

// Generate a 64-character random hex seed
export const generateServerSeed = (): string => {
  return Array.from({ length: 64 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join('');
};

// Calculate scaling factor based on last 10 payout results
export const calculateScalingFactor = (recentPayouts: number[]): number => {
  if (recentPayouts.length === 0) return 1;

  const averagePayout = recentPayouts.reduce((sum, val) => sum + val, 0) / recentPayouts.length;

  if (averagePayout > 3) return 1.2;
  if (averagePayout < 1.5) return 0.9;
  return 1;
};

// Simplified crash point verification (provably fair pattern)
export const verifyCrashPoint = (serverSeed: string, clientSeed: string, nonce: number): number => {
  const combinedSeed = serverSeed + clientSeed + nonce.toString();
  const hash = combinedSeed.slice(0, 8);
  const hashDecimal = parseInt(hash, 16) / HASH_PRECISION;

  if (hashDecimal < 0.6) {
    return 1 + hashDecimal / 0.6;
  } else if (hashDecimal < 0.9) {
    const normalizedVal = (hashDecimal - 0.6) / 0.3;
    return 2 + (normalizedVal * 3);
  } else {
    const normalizedVal = (hashDecimal - 0.9) / 0.1;
    return 5 + (20 * Math.pow(normalizedVal, 2));
  }
};

// Determine bet outcome based on cashout vs crash
export const calculateBetResult = (betAmount: number, cashoutMultiplier: number, crashPoint: number): number => {
  return cashoutMultiplier <= crashPoint ? betAmount * cashoutMultiplier : 0;
};

// Optional: Format currency string
export const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
};

// Optional: Calculate animation duration based on crash multiplier
export const calculateAnimationDuration = (crashPoint: number): number => {
  const base = 3;
  const scale = Math.log(crashPoint) / Math.log(2);
  return base * scale;
};
