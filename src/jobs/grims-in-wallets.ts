import { HydratedDocument, Types } from 'mongoose'
import path from 'path'
import fs from 'fs';
import * as web3 from "@solana/web3.js";
import Constants from '../constants';
import Models from '../models/index';
import { IWallet } from '../models/wallet-content';

const reqPerBatch = 5;
const timePerBatch = 1000;
const grimsMetaPath = path.resolve(__dirname, '../../grims_raw_metadata');

let foundTokens = 0;

function getTimestamp() {
	let now = new Date();

	return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours(), now.getUTCMinutes(), now.getUTCSeconds(), now.getUTCMilliseconds());
}

async function handleTokenState(connection:web3.Connection, walletJSON:HydratedDocument<IWallet>, tokenProgram:web3.PublicKey) {
	let promises = [];

	try {
		const queryWallet = new web3.PublicKey(walletJSON.wallet);
		const timestamp = getTimestamp();
		let result = await connection.getParsedTokenAccountsByOwner(queryWallet, {programId: tokenProgram});
		let list = {};

		for (let i in result.value) {
			let info = result.value[i].account.data.parsed.info;
			let mint = info.mint;

			if (fs.existsSync(path.resolve(grimsMetaPath, mint + '.json'))) {
				if (info.tokenAmount.uiAmount == 1 && !('delegate' in info)) {
					list[mint] = Constants.IN_WALLET;
				} else if (info.tokenAmount.uiAmount == 1 && ('delegate' in info)) {
					list[mint] = Constants.IN_WALLET_DELEGATED;
				} else if (!(mint in list)) {
					list[mint] = Constants.NOT_IN_WALLET;
				}
			}
		}

		let notInWallets = [];

		for (let n in list) {
			if (list[n] !== Constants.IN_WALLET) {
				notInWallets.push(n, list[n]);
			}
		}

		if (notInWallets.length > 0) {
			console.log('Tokens that are not in wallet: ', notInWallets.length);
			let tokens = await Models.Token.find({walletID: walletJSON._id, isStaked: true, mint: {$in: notInWallets}});

			for (let i in tokens) {
				let tokenJSON = tokens[i];
				let inWallet = tokenJSON.inWallet;
				let isStaked = tokenJSON.isStaked;
				let penaltyTimestamp = undefined;

				if (list[tokenJSON.mint] == Constants.IN_WALLET_DELEGATED) {
					penaltyTimestamp = timestamp;
					inWallet = Constants.IN_WALLET_DELEGATED;
					isStaked = false;
				} else if (list[tokenJSON.mint] == Constants.NOT_IN_WALLET) {
					penaltyTimestamp = timestamp;
					inWallet = Constants.NOT_IN_WALLET;
					isStaked = false;
				}

				if (penaltyTimestamp) {
					let staked = await tokenJSON.getLaststakedInfo();
					if (staked.penaltyTimestamp > 0 || staked.unstakedTimestamp > 0) {
						continue;
					}

					foundTokens++;

					promises.push(Models.StakeInfo.findByIdAndUpdate(staked._id, {
						penaltyTimestamp: penaltyTimestamp
					}));

					promises.push(Models.Token.findByIdAndUpdate(tokenJSON._id, {
						inWallet: inWallet,
						isStaked: isStaked
					}));
				}
			}
		}

		promises.push(Models.Wallet.findByIdAndUpdate(walletJSON._id, {
			lastChecked: timestamp
		}));
	} catch (e) {
		console.log(e);
	}

	return promises;
}

async function run(numWallets) {
	let timestampStart = getTimestamp();
	let success = true;

	try {
		const tokenProgram = new web3.PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
		let allWallets:HydratedDocument<IWallet>[] = await Models.Wallet.find({lastChecked: {$lte: timestampStart - Constants.WALLET_CHECK_INTERVAL}}).limit(numWallets);

		const connection = new web3.Connection(
			process.env.RPC_ENDPOINT,
			'confirmed'
		);

		for (let i = 0; i < allWallets.length; i += reqPerBatch) {
			let timestamp = getTimestamp();
			var promises = [new Promise(resolve => setTimeout(resolve, timePerBatch))];

			for (let b = 0; b < reqPerBatch; b++) {
				if (allWallets.length - 1 >= i + b) {
					promises = [...promises, ...(await handleTokenState(connection, allWallets[i + b], tokenProgram))];
				}
			}

			await Promise.all(promises);
		}
	} catch(err) {
		console.log(err);
		success = false;
	}

	return {
		success: success,
		foundTokens: foundTokens,
		time: (getTimestamp() - timestampStart) / 1000
	}
}

export default run;
