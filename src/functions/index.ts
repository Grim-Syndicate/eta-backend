import fs from "fs";
import path from 'path'
import nacl from "tweetnacl";
import base58 from "bs58";
import * as web3 from "@solana/web3.js";
import sha256 from 'crypto-js/sha256';
import Models from '../models/index';
import Constants from '../constants';

import transactionFunctions from './transactions';
import * as questingFunctions from './questing';
import * as auctionHouseFunctions from './auction-house';

const grimsMetaPath = path.resolve(__dirname, '../../grims_raw_metadata');
const daemonsMetaPath = path.resolve(__dirname, '../../daemons_raw_metadata');
const messagePrefix = "Please sign this message for proof of address ownership: ";

async function getWalletJSON(wallet:string) {
	let walletContentJSON = await Models.WalletContent.findOne({wallet: wallet});

	if (!walletContentJSON) {
		walletContentJSON = await Models.WalletContent.create({wallet: wallet});
	}

	return walletContentJSON;
}

async function getSimpleWalletJSON(wallet) {
	let walletContentJSON = await Models.Wallet.findOne({wallet: wallet});

	if (!walletContentJSON) {
		walletContentJSON = await Models.Wallet.create({wallet: wallet});
	}

	return walletContentJSON;
}

async function verifyTransaction(walletJSON, action, data, signature, blockhash) {
	let verified = false;

	try {
		const response = await getUser(walletJSON);

		if (!response.success) {
			return false;
		}

		let challenge = Constants.stringifyParams(data, action, response.user);
		challenge = sha256(challenge) + "";

		const connection = new web3.Connection(
			process.env.RPC_ENDPOINT,
			'confirmed'
		);

		const signatureUint8 = base58.decode(signature);
		const publicKey = new web3.PublicKey(walletJSON.wallet);

		let transaction = new web3.Transaction();
		transaction.feePayer = publicKey;
		transaction.recentBlockhash = blockhash;
		transaction.signatures.push({
			publicKey: publicKey,
			signature: signatureUint8
		});

		const instruction = new web3.TransactionInstruction({
			keys: [{ pubkey: publicKey, isSigner: true, isWritable: false }],
			programId: new web3.PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'),
			data: Buffer.from(challenge),
		});

		transaction.add(instruction);

		verified = transaction.verifySignatures();

		if (verified) {
			// create new nonce
			await getUser(walletJSON, true);
		}
	} catch (e) {
		console.log(e);
	}

	return verified;
}

async function verifyMessage(walletJSON, action, data, message) {
	let verified = false;

	try {	
		const response = await getUser(walletJSON);

		if (!response.success) {
			return false;
		}

		let challenge = Constants.stringifyParams(data, action, response.user);
		challenge = sha256(challenge) + "";

		const signatureUint8 = base58.decode(message);
		const nonceUint8 = new TextEncoder().encode(messagePrefix + challenge);
		const pubKeyUint8 = base58.decode(walletJSON.wallet);

		verified = nacl.sign.detached.verify(nonceUint8, signatureUint8, pubKeyUint8);

		if (verified) {
			// create new nonce
			await getUser(walletJSON, true);
		}
	} catch (e) {
		console.log(e);
	}

	return verified;
}

async function getUser(walletJSON, isNew = false) {
	if (typeof walletJSON == "string") {
		walletJSON = await getWalletJSON(walletJSON);
	}

	if (!process.env.WHITELIST_DISABLED && !walletJSON.isWhitelisted) {
		console.log('Access Denied');
		return {
			success: false,
			error: 'Access Denied'
		};
	}

	try {
		if (isNew || !walletJSON.isNonceValid()) {
			walletJSON = await walletJSON.newNonce();
		}
	} catch(err) {
		console.error('Error Occured',err);
		return {
			success: false,
			error: 'Error Occured'
		};
	}

	return {
		success: true,
		user: walletJSON.nonce
	}
}

async function getTokensInWallet(wallet) {
	let list = {};

	try {
		const connection = new web3.Connection(
			process.env.RPC_ENDPOINT,
			'confirmed'
		);
		const queryWallet = new web3.PublicKey(wallet);
		const tokenProgram = new web3.PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");

		let result = await connection.getParsedTokenAccountsByOwner(queryWallet, {programId: tokenProgram});

		for (let i in result.value) {
			let info = result.value[i].account.data.parsed.info;
			let mint = info.mint;

			if (info.tokenAmount.uiAmount == 1 && !('delegate' in info)) {
				list[mint] = Constants.IN_WALLET;
			} else if (info.tokenAmount.uiAmount == 1 && ('delegate' in info)) {
				list[mint] = Constants.IN_WALLET_DELEGATED;
			} else if (!(mint in list)) {
				list[mint] = Constants.NOT_IN_WALLET;
			}
			// else - state unchanged
		}
	} catch (err) {
		console.log(err);
	}

	return list;
}

async function getGrimsFromTokens(wallet, tokensInWallet = null) {
	let grimsInWallet = {};

	if (!tokensInWallet) {
		tokensInWallet = await getTokensInWallet(wallet);
	}

	for (var token in tokensInWallet) {
		try {
			if (fs.existsSync(path.resolve(grimsMetaPath, token + '.json'))) {
				grimsInWallet[token] = tokensInWallet[token];
			}
		} catch(err) {
			console.error(err)
		}
	}

	return grimsInWallet;
}

function getGrimMetadata(token) {
	if (!token) {
		return null;
	}

	try {
		let data = fs.readFileSync(path.resolve(grimsMetaPath, token + '.json'), 'utf8');
		return JSON.parse(data);
	} catch (e) {
		if (e.code === 'ENOENT') {
			return null;
		}
		console.log(e);
	}
	return null;
}

async function getDaemonsFromTokens(wallet, tokensInWallet) {
	let daemonsInWallet = {};

	if (!tokensInWallet) {
		tokensInWallet = await getTokensInWallet(wallet);
	}

	for (var token in tokensInWallet) {
		try {
			if (fs.existsSync(path.resolve(daemonsMetaPath, token + '.json'))) {
				daemonsInWallet[token] = tokensInWallet[token];
			}
		} catch(err) {
			console.error(err)
		}
	}

	return daemonsInWallet;
}

function getAllDaemonsMetadata(tokensInWallet) {
	let daemonsMetadata = [];

	for (let token in tokensInWallet) {
		if (tokensInWallet[token] === Constants.IN_WALLET) {
			let meta = getDaemonMetadata(token);

			if (meta) {
				daemonsMetadata.push(meta);
			}
		}
	}

	return daemonsMetadata;
}

function getDaemonMetadata(token:string) {
	if (!token) {
		return null;
	}

	try {
		let data = fs.readFileSync(path.resolve(daemonsMetaPath, token + '.json'), 'utf8');
		return JSON.parse(data);
	} catch (e) {
		if (e.code === 'ENOENT') {
			return null;
		}
		console.log(e);
	}
	return null;
}

export default {
	Transaction: transactionFunctions,
	Questing: questingFunctions,
	AuctionHouse: auctionHouseFunctions,
	getWalletJSON: getWalletJSON,
	getSimpleWalletJSON: getSimpleWalletJSON,
	getUser: getUser,
	getTokensInWallet: getTokensInWallet,
	getGrimsFromTokens: getGrimsFromTokens,
	getGrimMetadata: getGrimMetadata,
	getDaemonsFromTokens: getDaemonsFromTokens,
	getAllDaemonsMetadata: getAllDaemonsMetadata,
	getDaemonMetadata: getDaemonMetadata,
	verifyTransaction: verifyTransaction,
	verifyMessage: verifyMessage
}