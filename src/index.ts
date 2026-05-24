import dotenv from "dotenv";
import express from 'express';
import { burnTokens, mintTokens, sendNativeTokens } from './mintTokens.js';
import { PRIVATE_KEY, PUBLIC_KEY, TOKEN_MINT_ADDRESS } from './address.js';
dotenv.config();
const app = express();

type NativeTransferType = {
        amount: number;
        fromUserAccount: string;
        toUserAccount: string;
};

type TxnType = NativeTransferType &{
        signature: string;
        timestamp: number;
};

app.use(express.json());

app.post("/", (req, res)=>{
    console.log("Reeived a new transaction")
    console.log(req.body);
    console.log(`Feepayer: ${req.body[0].feePayer}`)
    console.log(`Acc Data: ${req.body[0].accountData}`)
    console.log(`Instructions: ${req.body[0].instructions}`)
    console.log(`Lamports: ${req.body[0].nativeTransfers[0].amount} `);
    console.dir(req.body[0].nativeTransfers[0], {depth: null});
})

const recievedTxns: TxnType[]= [];

app.post('/helius', async(req, res) => {
    // console.dir(req.body, {depth: null});
    let txnType: string="";

    if(req.body[0].nativeTransfers.length>0){
        txnType="received_native_sol";
    }
    else{
        txnType="received_lst";
    }

    if(txnType="received_native_sol"){
        const incomingTxn= req.body[0].nativeTransfers?.find((x:NativeTransferType ) => {
            console.log(`x.toUserAccount ${x.toUserAccount}`)
            return x.toUserAccount === PUBLIC_KEY});

        if(!incomingTxn){
            return res.json({message: "processed"})
        }

        const fromAddress = incomingTxn.fromUserAccount;
        const toAddress = incomingTxn.toUserAccount;
        const signature = req.body[0].signature;
        console.log("sign")
        console.log(signature)
        const amount = incomingTxn.amount;
        const timestamp = req.body[0].timestamp;
        console.log("timestamp", timestamp);
        // const amount =1;

        const txn= {
            amount,
            fromUserAccount: fromAddress,
            toUserAccount: toAddress,
            signature,
            timestamp
        }

        recievedTxns.push(txn);
        // await mintTokens(fromAddress, amount);
        return res.status(200).json({message: "Tokens minted successfully"});
    }
    else{
        const incomingTxn= req.body[0].tokenTransfers[0];
        const fromUserAddress = incomingTxn.fromUserAccount;
        const fromUserTokenAddress = incomingTxn.fromTokenAccount;
        const amount = incomingTxn.tokenAmount;

        // await burnTokens(fromAddress, toAddress, amount);
        // await sendNativeTokens(fromAddress, toAddress, amount);
    }

    // if()

    // if (type === "received_native_sol") {
    //     await mintTokens(fromAddress, toAddress, amount);
    // } else {
    //     // What could go wrong here?
    //     await burnTokens(fromAddress, toAddress, amount);
    //     await sendNativeTokens(fromAddress, toAddress, amount);
    // }

    // res.send('Transaction successful');
});

app.listen(3000, () => {
  console.log('Server is running on port 3000');
});