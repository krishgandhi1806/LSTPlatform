import dotenv from "dotenv";
import express from "express";
import { PUBLIC_KEY, TOKEN_MINT_ADDRESS } from "./address.js";
import {
  calculateLstToMint,
  calculateSolToReturn,
  getCurrentExchangeRate,
  PROTOCOL_START_TIMESTAMP,
} from "./conversion.js";
import {
  burnTreasuryTokens,
  getTreasuryTokenAccountAddress,
  mintTokens,
  sendNativeTokens,
} from "./mintTokens.js";

dotenv.config();

const app = express();
const treasuryWalletAddress = PUBLIC_KEY!;
const treasuryTokenAccountAddress = getTreasuryTokenAccountAddress();

type NativeTransferType = {
  amount?: number;
  fromUserAccount?: string;
  toUserAccount?: string;
};

type TokenTransferType = {
  mint?: string;
  fromTokenAccount?: string;
  toTokenAccount?: string;
  fromUserAccount?: string;
  toUserAccount?: string;
  tokenAmount?: number | string;
  rawTokenAmount?: {
    decimals?: number;
    tokenAmount?: string;
  };
};

type HeliusEvent = {
  signature?: string;
  timestamp?: number;
  feePayer?: string;
  nativeTransfers?: NativeTransferType[];
  tokenTransfers?: TokenTransferType[];
};

type LedgerEntry = {
  signature: string;
  kind: "deposit" | "redeem";
  walletAddress: string;
  timestamp: number;
  solLamports: string;
  lstBaseUnits: string;
  appliedExchangeRate: number;
};

app.use(express.json());

app.post("/", (req, res) => {
  console.log("Received a new transaction");
  console.dir(req.body, { depth: null });
  return res.status(200).json({ message: "ok" });
});

// Process-local only. A restart clears history and idempotency state.
const receivedTxns: LedgerEntry[] = [];
const processedSignatures = new Set<string>();

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null;
};

const isHeliusEventArray = (value: unknown): value is HeliusEvent[] => {
  return Array.isArray(value) && value.length > 0 && isRecord(value[0]);
};

const parseLamports = (amount: number | undefined): bigint | null => {
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
    return null;
  }

  return BigInt(Math.trunc(amount));
};

const decimalToBaseUnits = (value: string, decimals: number): bigint => {
  const trimmedValue = value.trim();

  if (!/^\d+(\.\d+)?$/.test(trimmedValue)) {
    throw new Error(`Invalid decimal amount: ${value}`);
  }

  const [wholePart = "0", fractionPart = ""] = trimmedValue.split(".");
  const paddedFraction = (fractionPart + "0".repeat(decimals)).slice(0, decimals);

  return BigInt(wholePart) * 10n ** BigInt(decimals) + BigInt(paddedFraction || "0");
};

const parseTokenAmount = (tokenTransfer: TokenTransferType): bigint | null => {
  const rawTokenAmount = tokenTransfer.rawTokenAmount?.tokenAmount;
  if (typeof rawTokenAmount === "string" && rawTokenAmount.length > 0) {
    return BigInt(rawTokenAmount);
  }

  const decimals = tokenTransfer.rawTokenAmount?.decimals ?? 9;

  if (typeof tokenTransfer.tokenAmount === "number" && Number.isFinite(tokenTransfer.tokenAmount)) {
    return decimalToBaseUnits(tokenTransfer.tokenAmount.toString(), decimals);
  }

  if (typeof tokenTransfer.tokenAmount === "string" && tokenTransfer.tokenAmount.length > 0) {
    return decimalToBaseUnits(tokenTransfer.tokenAmount, decimals);
  }

  return null;
};

const formatLedgerEntry = (entry: LedgerEntry) => ({
  ...entry,
  note: "Process-local only. This ledger resets on restart.",
});

const recordLedgerEntry = (entry: LedgerEntry) => {
  receivedTxns.push(entry);
  console.log("Ledger entry", formatLedgerEntry(entry));
};

const getEventTimestamp = (event: HeliusEvent) => {
  if (typeof event.timestamp !== "number" || !Number.isFinite(event.timestamp)) {
    throw new Error("Webhook event is missing a valid timestamp");
  }

  return Math.trunc(event.timestamp);
};

const getEventSignature = (event: HeliusEvent) => {
  if (typeof event.signature !== "string" || event.signature.length === 0) {
    throw new Error("Webhook event is missing a signature");
  }

  return event.signature;
};

const findIncomingNativeTransfer = (event: HeliusEvent) => {
  return event.nativeTransfers?.find((transfer) => {
    return transfer.toUserAccount === treasuryWalletAddress;
  });
};

const findIncomingLstTransfer = (event: HeliusEvent) => {
  return event.tokenTransfers?.find((transfer) => {
    const matchesMint = transfer.mint === TOKEN_MINT_ADDRESS.toBase58();
    const matchesTreasuryTokenAccount = transfer.toTokenAccount === treasuryTokenAccountAddress;
    const matchesTreasuryOwner = transfer.toUserAccount === treasuryWalletAddress;

    return matchesMint && (matchesTreasuryTokenAccount || matchesTreasuryOwner);
  });
};

const handleNativeDeposit = async (event: HeliusEvent) => {
  const nativeTransfer = findIncomingNativeTransfer(event);
  if (!nativeTransfer) {
    return { handled: false, response: { message: "No treasury SOL transfer found" } };
  }

  const signature = getEventSignature(event);
  if (processedSignatures.has(signature)) {
    return { handled: true, response: { message: "Duplicate webhook ignored" } };
  }

  if (typeof nativeTransfer.fromUserAccount !== "string" || nativeTransfer.fromUserAccount.length === 0) {
    throw new Error("Native transfer is missing the sender address");
  }

  const timestamp = getEventTimestamp(event);
  const solLamports = parseLamports(nativeTransfer.amount);
  if (!solLamports) {
    throw new Error("Native transfer is missing a valid lamport amount");
  }

  const lstBaseUnits = calculateLstToMint(solLamports, timestamp);
  if (lstBaseUnits <= 0n) {
    throw new Error("Calculated LST issuance amount must be positive");
  }

  const exchangeRate = getCurrentExchangeRate(timestamp);
  await mintTokens(nativeTransfer.fromUserAccount, lstBaseUnits);

  processedSignatures.add(signature);
  recordLedgerEntry({
    signature,
    kind: "deposit",
    walletAddress: nativeTransfer.fromUserAccount,
    timestamp,
    solLamports: solLamports.toString(),
    lstBaseUnits: lstBaseUnits.toString(),
    appliedExchangeRate: exchangeRate,
  });

  return {
    handled: true,
    response: {
      message: "Tokens minted successfully",
      signature,
      solLamports: solLamports.toString(),
      lstBaseUnits: lstBaseUnits.toString(),
      exchangeRate,
    },
  };
};

const handleLstRedemption = async (event: HeliusEvent) => {
  const tokenTransfer = findIncomingLstTransfer(event);
  if (!tokenTransfer) {
    return { handled: false, response: { message: "No treasury LST transfer found" } };
  }

  const signature = getEventSignature(event);
  if (processedSignatures.has(signature)) {
    return { handled: true, response: { message: "Duplicate webhook ignored" } };
  }

  if (typeof tokenTransfer.fromUserAccount !== "string" || tokenTransfer.fromUserAccount.length === 0) {
    throw new Error("Token transfer is missing the sender wallet address");
  }

  const timestamp = getEventTimestamp(event);
  const lstBaseUnits = parseTokenAmount(tokenTransfer);
  if (!lstBaseUnits || lstBaseUnits <= 0n) {
    throw new Error("Token transfer is missing a valid redemption amount");
  }

  const solLamports = calculateSolToReturn(lstBaseUnits, timestamp);
  if (solLamports <= 0n) {
    throw new Error("Calculated SOL redemption amount must be positive");
  }

  const exchangeRate = getCurrentExchangeRate(timestamp);
  await burnTreasuryTokens(lstBaseUnits);
  await sendNativeTokens(tokenTransfer.fromUserAccount, solLamports);

  processedSignatures.add(signature);
  recordLedgerEntry({
    signature,
    kind: "redeem",
    walletAddress: tokenTransfer.fromUserAccount,
    timestamp,
    solLamports: solLamports.toString(),
    lstBaseUnits: lstBaseUnits.toString(),
    appliedExchangeRate: exchangeRate,
  });

  return {
    handled: true,
    response: {
      message: "Tokens redeemed successfully",
      signature,
      solLamports: solLamports.toString(),
      lstBaseUnits: lstBaseUnits.toString(),
      exchangeRate,
    },
  };
};

app.get("/ledger", (_req, res) => {
  return res.status(200).json({
    protocolStartTimestamp: PROTOCOL_START_TIMESTAMP,
    treasuryWalletAddress,
    treasuryTokenAccountAddress,
    processedSignatures: processedSignatures.size,
    entries: receivedTxns.map(formatLedgerEntry),
  });
});

app.post("/helius", async (req, res) => {
  try {
    if (!isHeliusEventArray(req.body)) {
      return res.status(400).json({ message: "Expected a non-empty Helius event array" });
    }

    const [event] = req.body;
    if (!event) {
      return res.status(400).json({ message: "Expected a non-empty Helius event array" });
    }

    const nativeResult = await handleNativeDeposit(event);
    if (nativeResult.handled) {
      return res.status(200).json(nativeResult.response);
    }

    const redemptionResult = await handleLstRedemption(event);
    if (redemptionResult.handled) {
      return res.status(200).json(redemptionResult.response);
    }

    return res.status(200).json({ message: "No treasury transfer to process" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown webhook processing error";
    console.error("Webhook processing failed", error);
    return res.status(400).json({ message });
  }
});

app.listen(3000, () => {
  console.log("Server is running on port 3000");
});
