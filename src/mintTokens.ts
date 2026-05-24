import {
    burn,
    getAssociatedTokenAddressSync,
    getOrCreateAssociatedTokenAccount,
    mintTo,
} from "@solana/spl-token";
import { Connection, Keypair, PublicKey, sendAndConfirmTransaction, SystemProgram, Transaction } from "@solana/web3.js";
import {PRIVATE_KEY, PUBLIC_KEY, TOKEN_MINT_ADDRESS} from "./address.js";

const connection = new Connection("https://api.devnet.solana.com");

const secretKey = Uint8Array.from(JSON.parse(PRIVATE_KEY!));
const keypair= Keypair.fromSecretKey(secretKey);
const mint= new PublicKey(TOKEN_MINT_ADDRESS);
const treasuryPublicKey = new PublicKey(PUBLIC_KEY!);
const treasuryTokenAccount = getAssociatedTokenAddressSync(mint, treasuryPublicKey);

const toSafeIntegerAmount = (amount: bigint) => {
    if (amount < 0n) {
        throw new Error("Amount cannot be negative");
    }

    if (amount > BigInt(Number.MAX_SAFE_INTEGER)) {
        throw new Error("Amount exceeds Number.MAX_SAFE_INTEGER");
    }

    return Number(amount);
};


export const mintTokens = async (fromAddress: string, amount: bigint) => {
    console.log("Minting tokens");
    const associatedTokenAccount = await getOrCreateAssociatedTokenAccount(
        connection, // Connection to the local validator.
        keypair, // Account funding account creation.
        TOKEN_MINT_ADDRESS, // Mint for the token this account holds.
        new PublicKey(fromAddress), // Account that owns the token account.
    );
    console.log("Associated Token Account", associatedTokenAccount);
    await mintTo(
        connection,
        keypair,
        TOKEN_MINT_ADDRESS,
        associatedTokenAccount.address,
        keypair,
        amount,
    );
}

export const burnTreasuryTokens = async (amount: bigint) => {
    console.log("Burning tokens from treasury ATA");
    await getOrCreateAssociatedTokenAccount(
        connection,
        keypair,
        TOKEN_MINT_ADDRESS,
        treasuryPublicKey,
    );

    await burn(
        connection,
        keypair,
        treasuryTokenAccount,
        mint,
        keypair.publicKey,
        amount
    )
}

export const sendNativeTokens = async (toAddress: string, amount: bigint) => {
    console.log("Sending native tokens");

    const latestBlockHash= await connection.getLatestBlockhash();
    const recipientPublicKey= new PublicKey(toAddress);

    const transfer= SystemProgram.transfer({
        fromPubkey: keypair.publicKey,
        toPubkey: recipientPublicKey,
        lamports: toSafeIntegerAmount(amount)
    })

    const transaction= new Transaction();
    transaction.add(transfer);

    transaction.recentBlockhash= latestBlockHash.blockhash;
    transaction.lastValidBlockHeight= latestBlockHash.lastValidBlockHeight;

    const signature = await sendAndConfirmTransaction(connection, transaction, [keypair]);

    await connection.confirmTransaction({
        signature,
        blockhash: latestBlockHash.blockhash,
        lastValidBlockHeight: latestBlockHash.lastValidBlockHeight
    })
    
}

export const getTreasuryTokenAccountAddress = () => treasuryTokenAccount.toBase58();
