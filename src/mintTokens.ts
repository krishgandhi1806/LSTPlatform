import {mintTo, getOrCreateAssociatedTokenAccount, TOKEN_PROGRAM_ID, burn} from "@solana/spl-token";
import { Connection, Keypair, PublicKey, sendAndConfirmTransaction, SystemProgram, Transaction } from "@solana/web3.js";
import {PRIVATE_KEY, TOKEN_MINT_ADDRESS} from "./address.js";

const connection = new Connection("https://api.devnet.solana.com");

const secretKey = Uint8Array.from(JSON.parse(PRIVATE_KEY!));
const keypair= Keypair.fromSecretKey(secretKey);
const mint= new PublicKey(TOKEN_MINT_ADDRESS);


export const mintTokens = async (fromAddress: string, amount: number) => {
    console.log("Minting tokens");
    const associatedTokenAccount = await getOrCreateAssociatedTokenAccount(
        connection, // Connection to the local validator.
        keypair, // Account funding account creation.
        TOKEN_MINT_ADDRESS, // Mint for the token this account holds.
        new PublicKey(fromAddress), // Account that owns the token account.
    );
    console.log("Associated Token Account", associatedTokenAccount);
    await mintTo(connection, keypair, TOKEN_MINT_ADDRESS, associatedTokenAccount.address, keypair, amount);
}

export const burnTokens = async (fromAddress: string, toAddress: string, amount: number) => {
    console.log("Burning tokens");
    const tokenAccount= await getOrCreateAssociatedTokenAccount(
        connection,
        keypair,
        TOKEN_MINT_ADDRESS,
        new PublicKey(fromAddress)
    )

    await burn(
        connection,
        keypair,
        tokenAccount.address,
        mint,
        keypair.publicKey,
        amount
    )
}

export const sendNativeTokens = async (fromAddress: string, toAddress: string, amount: number) => {
    console.log("Sending native tokens");

    const latestBlockHash= await connection.getLatestBlockhash();
    const recipientPublicKey= new PublicKey(toAddress);

    const transfer= SystemProgram.transfer({
        fromPubkey: keypair.publicKey,
        toPubkey: recipientPublicKey,
        lamports: amount
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