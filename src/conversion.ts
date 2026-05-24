import dotenv from "dotenv";

dotenv.config();

const RATE_SCALE = 1_000_000_000_000n;
const SECONDS_PER_YEAR = 31_536_000n;
const APR_NUMERATOR = 6n;
const APR_DENOMINATOR = 100n;
const DEFAULT_PROTOCOL_START_TIMESTAMP = 1779571200; // 2026-05-24T00:00:00Z

const configuredProtocolStart = Number(
  process.env.PROTOCOL_START_TIMESTAMP ?? DEFAULT_PROTOCOL_START_TIMESTAMP,
);

if (!Number.isFinite(configuredProtocolStart) || configuredProtocolStart < 0) {
  throw new Error("PROTOCOL_START_TIMESTAMP must be a non-negative unix timestamp");
}

export const PROTOCOL_START_TIMESTAMP = Math.trunc(configuredProtocolStart);

const normalizeTimestamp = (timestamp: number) => {
  if (!Number.isFinite(timestamp)) {
    throw new Error("Timestamp must be a finite number");
  }

  return Math.max(Math.trunc(timestamp), PROTOCOL_START_TIMESTAMP);
};

const getCurrentExchangeRateScaled = (nowTimestamp: number): bigint => {
  const elapsedSeconds = BigInt(normalizeTimestamp(nowTimestamp) - PROTOCOL_START_TIMESTAMP);
  const accruedRate =
    (APR_NUMERATOR * elapsedSeconds * RATE_SCALE) /
    (APR_DENOMINATOR * SECONDS_PER_YEAR);

  return RATE_SCALE + accruedRate;
};

export const getCurrentExchangeRate = (nowTimestamp: number): number => {
  return Number(getCurrentExchangeRateScaled(nowTimestamp)) / Number(RATE_SCALE);
};

export const calculateLstToMint = (
  solLamports: bigint,
  nowTimestamp: number,
): bigint => {
  if (solLamports < 0n) {
    throw new Error("SOL deposit amount cannot be negative");
  }

  const rate = getCurrentExchangeRateScaled(nowTimestamp);
  return (solLamports * RATE_SCALE) / rate;
};

export const calculateSolToReturn = (
  lstBaseUnits: bigint,
  nowTimestamp: number,
): bigint => {
  if (lstBaseUnits < 0n) {
    throw new Error("LST redemption amount cannot be negative");
  }

  const rate = getCurrentExchangeRateScaled(nowTimestamp);
  return (lstBaseUnits * rate) / RATE_SCALE;
};
