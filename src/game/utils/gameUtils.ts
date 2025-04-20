import * as crypto from 'crypto';
const HASH_PRECISION = Math.pow(2, 32);

export const generateQuotaPool = (): ('low' | 'mid' | 'high')[] => {
  const pool = [
    ...Array(6).fill('low'),
    ...Array(3).fill('mid'),
    ...Array(1).fill('high')
  ];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool;
};

export const generateCrashPoint = (
  type: 'low' | 'mid' | 'high',
  serverSeed: string,
  scalingFactor: number = 1,
  riskScore: number = 0,
  betCount: number = 0  
): number => {
  const sha256 = crypto.createHash('sha256').update(serverSeed).digest('hex');
  const hash = sha256.slice(0, 8);
  const hashDecimal = parseInt(hash, 16) / HASH_PRECISION;
  const adjusted = Math.min(Math.max(hashDecimal * scalingFactor, 0), 0.9999);

  const biased = Math.pow(adjusted, 1 + riskScore * 3);

  let boostFactor = 1;
  if (betCount === 0) {
    boostFactor = 1.6;
  } else if (betCount <= 3) {
    boostFactor = 1.3;
  } else if (betCount > 10) {
    boostFactor = 0.8;
  }

  const leakChance = Math.random();
  const shouldLeak = betCount > 5 && leakChance < 0.1;
  if (shouldLeak) {
    boostFactor = 1.5;
  }

  let result: number;
  if (type === 'low') {
    result = 1 + Math.pow(biased, 0.6) * 0.9 * boostFactor;
  } else if (type === 'mid') {
    result = (2 + biased * 3) * boostFactor;
  } else {
    result = (5 + Math.pow(biased, 2) * 35) * boostFactor;
  }

  return Math.round(result * 100) / 100;
};

export const generateServerSeed = (): string => {
  return Array.from({ length: 64 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join('');
};


export const calculateScalingFactor = (recentPayouts: number[]): number => {
  if (recentPayouts.length === 0) return 1;

  const averagePayout = recentPayouts.reduce((sum, val) => sum + val, 0) / recentPayouts.length;

  if (averagePayout > 3) return 1.2;
  if (averagePayout < 1.5) return 0.9;
  return 1;
};


export const verifyCrashPoint = (
  serverSeed: string,
  clientSeed: string,
  nonce: number
): number => {
  const combinedSeed = serverSeed + clientSeed + nonce.toString();
  const hash = combinedSeed.slice(0, 8);
  const hashDecimal = parseInt(hash, 16) / HASH_PRECISION;

  if (hashDecimal < 0.6) {
    return 1 + hashDecimal / 0.6;
  } else if (hashDecimal < 0.9) {
    const normalizedVal = (hashDecimal - 0.6) / 0.3;
    return 2 + normalizedVal * 3;
  } else {
    const normalizedVal = (hashDecimal - 0.9) / 0.1;
    return 5 + 20 * Math.pow(normalizedVal, 2);
  }
};


export const calculateBetResult = (
  betAmount: number,
  cashoutMultiplier: number,
  crashPoint: number
): number => {
  return cashoutMultiplier <= crashPoint ? betAmount * cashoutMultiplier : 0;
};


export const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
};
