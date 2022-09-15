import fs from "fs";
import path from 'path'
import * as web3 from "@solana/web3.js";
import nameService from '@bonfida/spl-name-service';
import Models from './models/index';
import Constants from './constants';
import Functions from './functions/index';

const database = "grims_universe";

const SOL_TLD_AUTHORITY = new web3.PublicKey(
  "58PwtjSDuFHuUkYjH9BYnnQKHfwo9reZhC2zMJv9JPkx"
);
const ROOT_TLD_AUTHORITY = new web3.PublicKey(
  "ZoAhWEqTVqHVqupYmEanDobY7dee5YKbQox9BNASZzU"
);

async function stakeToken(walletJSON, token, timestamp) {
	let tokenJSON = await walletJSON.getToken(token);

	if (!tokenJSON) {
		tokenJSON = await Models.Token.create({
			walletID: walletJSON._id,
			mint: token, 
			inWallet: Constants.IN_WALLET,
			isStaked: false
		});
	}

	// make sure we always unstake previous stakes (even if the flag was wrong)
	await Models.StakeInfo.collection.updateMany(
		{
			tokenID: tokenJSON._id,
			unstakedTimestamp: {$exists: false},
			$or: [{penaltyTimestamp: {$exists: false}}, {penaltyTimestamp: {$not: {$gt: 0}}}]
		},
		{
			$set:
			{
				unstakedTimestamp: timestamp
			}
		}
	);

	// create new stake info
	await Models.StakeInfo.create({tokenID: tokenJSON._id, stakedTimestamp: timestamp, claimedTimestamp: timestamp});

	let stamina = await Models.Stamina.findById(tokenJSON._id);

	if (!stamina) {
		stamina = await Models.Stamina.create({_id: tokenJSON._id, timestamp: timestamp, stamina: 0});
	} else {
		await Models.Stamina.findByIdAndUpdate(
			tokenJSON._id,
			{
				timestamp: timestamp,
				stamina: 0
			}
		);
	}


	// update the stake flag to true
	await Models.Token.findByIdAndUpdate(
		tokenJSON._id, 
		{
			isStaked: true
		}
	);
}

async function unstakeToken(walletJSON, token, timestamp) {
	let tokenJSON = await walletJSON.getToken(token);
	let claimablePoints = 0;

	if (tokenJSON) {
		try {
			claimablePoints = await claimPoints(walletJSON, tokenJSON.mint);
		} catch(e) {
			console.log(e);
		}

		try {
			// make sure we always unstake previous stakes (even if the flag was wrong)
			await Models.StakeInfo.collection.updateMany(
				{
					tokenID: tokenJSON._id,
					unstakedTimestamp: {$exists: false},
					$or: [{penaltyTimestamp: {$exists: false}}, {penaltyTimestamp: {$not: {$gt: 0}}}]
				},
				{
					$set:
					{
						unstakedTimestamp: timestamp
					}
				}
			);

			// update the stake flag to true
			await Models.Token.findByIdAndUpdate(
				tokenJSON._id, 
				{
					isStaked: false
				}
			);
		} catch (e) {
			console.log(e);
		}
	}

	return claimablePoints;
}

async function claimPoints(walletJSON, token) {
	let tokenJSON = await walletJSON.getToken(token);
	let claimablePoints = 0;
	let lockedPoints = 0;

	if (tokenJSON) {
		const oneLockingPeriod = Constants.ONE_LOCKING_PERIOD / Constants.PERIOD_PER_TIMEPRIOD;

		let grimMetadata = Functions.getGrimMetadata(token);
		let department = 'Base' in grimMetadata && grimMetadata['Base'] in Constants.BASE_DEPARTMENTS ? Constants.BASE_DEPARTMENTS[grimMetadata['Base']] : "BASE_MYTHIC";
		let baseMultiplier = department in Constants.BASE_POINTS ? Constants.BASE_POINTS[department] : 1;
		let pointsPerTimeperiod = Constants.POINTS_PER_TIMEPERIOD * baseMultiplier;

		let stakedInfos = await Models.StakeInfo.find({tokenID: tokenJSON._id, hasClaimablePoint: true});
		let transactionID = null;

		for (let i in stakedInfos) {
			let stakedInfo = stakedInfos[i];

			if (!stakedInfo || stakedInfo.penaltyTimestamp > 0) {
				continue;
			}

			try {
				[claimablePoints, lockedPoints] = await getClaimablePointsFromStakeInfo(pointsPerTimeperiod, stakedInfo);
				let lastClaimedTimestamp = stakedInfo.claimedTimestamp || stakedInfo.stakedTimestamp;
				let length = (Constants.getTimestamp() - stakedInfo.stakedTimestamp) / oneLockingPeriod;
				let lastClaimableTimestamp = stakedInfo.stakedTimestamp + (Math.floor(length) * oneLockingPeriod);

				let transaction = await Functions.Transaction.create('CLAIM', walletJSON._id, walletJSON._id, claimablePoints, stakedInfo._id, lastClaimableTimestamp, lockedPoints > 0);
				transactionID = transaction._id;
				
				let success = await Functions.Transaction.handleClaimPending(transaction, walletJSON.wallet);
				if (!success) throw new Error('Failed claim at pending step: ' + tokenJSON.mint);

				success = await Functions.Transaction.handleClaimSettling(transaction, walletJSON.wallet);
				if (!success) throw new Error('Failed claim at settling step: ' + tokenJSON.mint);

				success = (await Functions.Transaction.setStatus(transaction._id, 'SETTLED')) != false;
				if (!success) throw new Error('Failed claim at settled step: ' + tokenJSON.mint);
			} catch (e) {
				console.log(e);

				if (transactionID) {
					// await Functions.Transaction.revertClaimTransaction(transaction._id);
					await Functions.Transaction.cancelAllClaimTransactions();
				}

				return 0;
			}
		}
	}

	return claimablePoints;
}

async function getClaimablePoints(pointsPerTimeperiod, token) {
	let unclaimedPoints = 0;
	let lockedPoints = 0;

	for (let i in token.stakedInfo) {
		let stakedInfo = token.stakedInfo[i];
		if (!stakedInfo || stakedInfo.penaltyTimestamp) {
			continue;
		}

		try {
			let [points, locked] = await getClaimablePointsFromStakeInfo(pointsPerTimeperiod, stakedInfo);

			unclaimedPoints += points;
			lockedPoints += locked;
		} catch (e) {
			console.log(e);
		}
	}


	return [unclaimedPoints, lockedPoints];
}

async function getClaimablePointsFromStakeInfo(pointsPerTimeperiod, stakedInfo) {
	const lockingPeriod = Constants.LOCKING_PERIOD * Constants.PERIOD_PER_TIMEPRIOD;
	const oneLockingPeriod = Constants.ONE_LOCKING_PERIOD / Constants.PERIOD_PER_TIMEPRIOD;
	const pointsPerPeriod = pointsPerTimeperiod / Constants.PERIOD_PER_TIMEPRIOD;

	let unclaimedPoints = 0;
	let lockedPoints = 0;

	// let length = (new Date().getTime() - stakedInfo.stakedTimestamp) / oneLockingPeriod;
 //  let lastClaimableTimestamp = stakedInfo.stakedTimestamp + (Math.floor(length) * oneLockingPeriod);

  let lastClaimableTimestamp = Constants.getTimestamp();
	let prevClaimed = (stakedInfo.claimedTimestamp - stakedInfo.stakedTimestamp) / oneLockingPeriod;
	let prevClaimable = stakedInfo.unstakedTimestamp > 0 ? ((stakedInfo.unstakedTimestamp - stakedInfo.stakedTimestamp) / oneLockingPeriod) : prevClaimed;
	let currentPeriod = (lastClaimableTimestamp - stakedInfo.claimedTimestamp) / oneLockingPeriod;

	let overflow = prevClaimable > lockingPeriod ? Math.ceil(prevClaimable) - lockingPeriod : 0;
	prevClaimable = prevClaimable - overflow;
	prevClaimed = prevClaimed - overflow;

	let claimablePeriod = prevClaimable + (stakedInfo.unstakedTimestamp > 0 ? 0 : currentPeriod);
	let iterationPeriod = prevClaimed + currentPeriod;

	for (let period = iterationPeriod, claimableIndex = claimablePeriod, lockedIndex = Math.min(claimablePeriod, prevClaimed); period > 0; period--, claimableIndex--, lockedIndex--) {
		let amount = claimableIndex > 0 ? 1 : 0;

		if (0 < claimableIndex && claimableIndex < 1) {
			amount = claimableIndex - Math.floor(claimableIndex);
		}

		let claimedAmount = lockedIndex < 1 ? Math.max(0, lockedIndex) : Math.min(Math.floor(lockedIndex), lockingPeriod);
		let unlockedAmount = period < 1 ? Math.max(0, period) : Math.min(Math.floor(period), lockingPeriod);
		let lockedAmount = lockingPeriod - (unlockedAmount < 1 ? 0 : unlockedAmount);
		let points = period < 1 ? 0 : ((unlockedAmount - claimedAmount) / lockingPeriod) * pointsPerPeriod * amount;
		let locked = (lockedAmount / lockingPeriod) * pointsPerPeriod * amount;

		if (currentPeriod < 1 ) {
			points = 0;
		}

		unclaimedPoints += points;
		lockedPoints += locked;
	}

	return [unclaimedPoints, lockedPoints];
}

async function handleTokens(token, walletJSON, departments, walletContentJSON, tokensInWallet) {
	let walletToken = await walletContentJSON.getToken(token);
	let grimMetadata = Functions.getGrimMetadata(token);
	let daemonMetadata = Functions.getDaemonMetadata(token);

	if (grimMetadata) {
		//it's a grim

		let department = 'Base' in grimMetadata && grimMetadata['Base'] in Constants.BASE_DEPARTMENTS ? Constants.BASE_DEPARTMENTS[grimMetadata['Base']] : "BASE_MYTHIC";
		let baseMultiplier = department in Constants.BASE_POINTS ? Constants.BASE_POINTS[department] : 1;
		let pointsPerTimeperiod = Constants.POINTS_PER_TIMEPERIOD * baseMultiplier;

		if (!walletToken) {
			walletToken = new Models.Token({ wallet: walletContentJSON.wallet, mint: token, inWallet: Constants.IN_WALLET, isStaked: false }).toJSON();

			walletToken.metadata = grimMetadata;
			walletToken.multiplier = baseMultiplier;
			walletToken.department = department;
			walletToken.pointsPerTimeperiod = pointsPerTimeperiod;

			walletToken.pointsLocked = 0;
			walletToken.pointsUnclaimed = 0;

			walletJSON.unstaked[token] = walletToken;
		} else {
			let jsonToken = walletToken.toJSON();
			jsonToken.metadata = grimMetadata;
			jsonToken.multiplier = baseMultiplier;
			jsonToken.department = department;
			jsonToken.pointsPerTimeperiod = pointsPerTimeperiod;

			jsonToken.inWallet = token in tokensInWallet ? tokensInWallet[token] : Constants.NOT_IN_WALLET; //TODO: do you need to check it here?

			walletToken = await walletToken.handleWalletState(jsonToken.inWallet);

			// jsonToken.isStaked = walletToken.staked;
			jsonToken.hasPenalty = await walletToken.hasPenalty();
			jsonToken.unstakedTimestamp = await walletToken.getUnstakedTimestamp();
			jsonToken.stakedTimestamp = await walletToken.getStakedTimestamp();
			jsonToken.claimedTimestamp = await walletToken.getClaimedTimestamp() || await walletToken.getStakedTimestamp();
			jsonToken.penaltyTimestamp = await walletToken.getPenaltyTimestamp(); 
			jsonToken.stamina = null;
			jsonToken.cooldownTimestamp = null;

			if (jsonToken.isStaked && jsonToken.inWallet === Constants.IN_WALLET && !jsonToken.hasPenalty) {
				departments[department]++;

				[jsonToken.stamina, jsonToken.cooldownTimestamp, jsonToken.maxStamina] = await Functions.Questing.generateStamina(walletToken._id, Constants.ONE_COOLDOWN_PERIOD, walletJSON.walletCooldownRate, Constants.COOLDOWN_UNITS);

				[jsonToken.pointsUnclaimed, jsonToken.pointsLocked] = await getClaimablePoints(pointsPerTimeperiod, walletToken);

				walletJSON.staked[token] = jsonToken;
			} else if (jsonToken.hasPenalty) {
				walletJSON.benched[token] = jsonToken;
			} else if (jsonToken.inWallet !== Constants.NOT_IN_WALLET) {
				[jsonToken.pointsUnclaimed, jsonToken.pointsLocked] = await getClaimablePoints(pointsPerTimeperiod, walletToken);
				walletJSON.unstaked[token] = jsonToken;
			// } else if (walletToken.hasClaimablePoints) {
			} else {
				[jsonToken.pointsUnclaimed, jsonToken.pointsLocked] = await getClaimablePoints(pointsPerTimeperiod, walletToken);

				if (jsonToken.pointsUnclaimed > 0 || jsonToken.pointsLocked > 0) {
					walletJSON.hidden[token] = jsonToken;
				}
			}
		}
	} else if(daemonMetadata){
		//its a daemon

		if (!walletToken) {
			walletToken = new Models.Token({ wallet: walletContentJSON.wallet, mint: token, inWallet: Constants.IN_WALLET, isStaked: false }).toJSON();

			walletToken.metadata = daemonMetadata;
			walletJSON.daemons[token] = walletToken;
		} else {
			walletJSON.daemons[token] = walletToken;
		}
	}
}


async function getGrimsState(wallet) {
	let walletJSON = { 
        wallet: wallet, 
        staked: {},
        unstaked: {}, 
        benched: {}, 
        hidden: {}, 
        daemons: {},
        pointsClaimed:null,
        pointsBalance:null,
        walletCooldownRate:null,
        oneCooldownInterval:null,
    };

	let departments = {
		BASE_COMMON: 0,
		BASE_RARE: 0,
		BASE_LEGENDARY: 0,
		BASE_MYTHIC: 0,
		BASE_ANCIENT: 0,
		BASE_GOLDEN_ANCIENT: 0,
		BASE_DAEMON: 0
	};

	let promises = [];

	try {
		let walletContentJSON = await Functions.getWalletJSON(wallet);

		if (!process.env.WHITELIST_DISABLED && !walletContentJSON.isWhitelisted) {
			console.log('Access Denied');
			return {
				success: false,
				error: 'Access Denied'
			};
		}

		let tokensInWallet = await Functions.getTokensInWallet(wallet);
		let grimTokens = await Functions.getGrimsFromTokens(wallet, tokensInWallet);
		let daemonTokens = await Functions.getDaemonsFromTokens(wallet, tokensInWallet);
		let daemonsMetadata = Functions.getAllDaemonsMetadata(tokensInWallet);

		console.log(daemonTokens)
		console.log(daemonsMetadata)

		let tokens = [];

		for (let i in grimTokens) {
			if (tokens.indexOf(i) === -1 && grimTokens[i] == Constants.IN_WALLET) {
				tokens.push(i);
			}
		}

		for (let i in daemonTokens) {
			if (tokens.indexOf(i) === -1 && daemonTokens[i] == Constants.IN_WALLET) {
				tokens.push(i);
			}
		}

		for (let i in walletContentJSON.walletTokens) {
			let mint = walletContentJSON.walletTokens[i].mint;
			if (tokens.indexOf(mint) === -1) {
				tokens.push(mint);
			}
		}

		promises.push(handleStakedGrimsNotInWallet(walletContentJSON, grimTokens));

		walletJSON.pointsClaimed = walletContentJSON.pointsClaimed.toFixed(4);
		walletJSON.pointsBalance = walletContentJSON.pointsBalance.toFixed(4);

		departments["BASE_DAEMON"] = daemonsMetadata.length;

		let walletCooldownRate = 1 + (Math.min(Constants.COOLDOWN_DAEMONS_MAX, daemonsMetadata.length) * Constants.COOLDOWN_DAEMON_IMPACT_RATE) / 100;
		walletJSON.walletCooldownRate = walletCooldownRate.toFixed(4);
		walletJSON.oneCooldownInterval = Constants.ONE_COOLDOWN_PERIOD;

		for (let i in tokens) {
			promises.push(handleTokens(tokens[i], walletJSON, departments, walletContentJSON, tokensInWallet));
		}
	} catch(err) {
		console.error('Error Occured', err);
		return {
			success: false,
			error: 'Error Occured'
		};
	}

	await Promise.all(promises);

	return {
		success: true,
		wallet: walletJSON,
		departments: departments,
		airdropApproved: Object.keys(walletJSON.staked).length > 0,
	}
}

async function getPublicState() {
	const stakedGrims = await getStakedGrimsCount();
	const solPrice = await getSolPrice();
	const floorPrice = await getFloorPrice();
	let build = ''

	try {
		build = fs.readFileSync(path.resolve(__dirname, '../.build'), 'utf8');
	} catch (e) {
	}

	return {
		success: true,
		allStakedTokens: stakedGrims?.config?.GRIMS,
		solPrice: solPrice.config,
		floorPrice: floorPrice.config,
		build: build
	}
}

export async function doGetGrimsState(wallet) {
	if (!wallet) {
		console.log('Invalid Request');
		return {
			success: false,
			error: 'Invalid Request'
		}
	}

	let result = await getGrimsState(wallet);

	return result;
}

export async function doGetPublicState() {
	let result = await getPublicState();

	return result;
}

export async function doStake(wallet, tokens, message, blockhash) {
	if (!wallet || !tokens || !message) {
		console.log('Invalid Request');
		return {
			success: false,
			error: 'Invalid Request'
		};
	}

	const timestamp = Constants.getTimestamp();

	try {
		let walletJSON = await Functions.getWalletJSON(wallet);

		if (!process.env.WHITELIST_DISABLED && !walletJSON.isWhitelisted) {
			console.log('Access Denied');
			return {
				success: false,
				error: 'Access Denied'
			};
		}

		let messageResult = false;
		let action = 'stake';
		let data = {
			tokens: tokens,
			wallet: wallet
		};

		if (!blockhash) {
			messageResult = await Functions.verifyMessage(walletJSON, action, data, message);
		} else {
			messageResult = await Functions.verifyTransaction(walletJSON, action, data, message, blockhash);
		}

		if (!messageResult) {
			console.log('Verification Failed');
			return {
				success: false,
				error: 'Verification Failed'
			}
		}
		
		let tokensInWallet = await Functions.getGrimsFromTokens(wallet);
		let promises = [];

		promises.push(handleStakedGrimsNotInWallet(wallet, tokensInWallet));

		for (let i in tokens) {
			let token = tokens[i];

			if (token in tokensInWallet && tokensInWallet[token] == Constants.IN_WALLET) {
				promises.push(stakeToken(walletJSON, tokens[i], timestamp));
			}
		}

		await Promise.all(promises);
	} catch(err) {
		console.error('Error Occured', err);
		return {
			success: false,
			error: 'Error Occured'
		};
	}

	return {
		success: true
	}
}

export async function doUnstake(wallet, tokens, message, blockhash) {
	if (!wallet || !tokens || !message) {
		console.log('Invalid Request');
		return {
			success: false,
			error: 'Invalid Request'
		};
	}

	const timestamp = Constants.getTimestamp();

	try {
		let walletJSON = await Functions.getWalletJSON(wallet);

		if (!process.env.WHITELIST_DISABLED && !walletJSON.isWhitelisted) {
			console.log('Access Denied');
			return {
				success: false,
				error: 'Access Denied'
			};
		}

		let messageResult = false;
		let action = 'unstake';
		let data = {
			tokens: tokens,
			wallet: wallet
		};

		if (!blockhash) {
			messageResult = await Functions.verifyMessage(walletJSON, action, data, message);
		} else {
			messageResult = await Functions.verifyTransaction(walletJSON, action, data, message, blockhash);
		}

		if (!messageResult) {
			console.log('Verification Failed');
			return {
				success: false,
				error: 'Verification Failed'
			}
		}

		let tokensInWallet = await Functions.getGrimsFromTokens(wallet);
		let promises = [];

		promises.push(handleStakedGrimsNotInWallet(wallet, tokensInWallet));

		for (let i in tokens) {
			let token = tokens[i];

			if (token in tokensInWallet && tokensInWallet[token] == Constants.IN_WALLET) {
				promises.push(unstakeToken(walletJSON, token, timestamp));
			}
		}

		await Promise.all(promises);
	} catch(err) {
		console.error('Error Occured', err);
		return {
			success: false,
			error: 'Error Occured'
		};
	}

	return {
		success: true
	}
}

async function getAddressFromDomain(fullDomain) {
	try {
		let domain = fullDomain.replace('.sol', '');

		const connection = new web3.Connection(
			process.env.RPC_ENDPOINT,
			'confirmed'
		);

		let t = domain.split('.');
		let subdomain = '';

		if (t > 1) {
			subdomain = domain.replace('.' + t[t.length - 1]);
			domain = t[t.length - 1];
		}

		const hashedName = await nameService.getHashedName(domain);
        let domainKey = await nameService.getNameAccountKey(
			hashedName,
			undefined,
			SOL_TLD_AUTHORITY
		);

		if (subdomain != '') {
			domainKey = await nameService.getDNSRecordAddress(domainKey, subdomain);
		}

		const registry = await nameService.NameRegistryState.retrieve(connection, domainKey);

		if (registry) return registry.nftOwner.toBase58();
	} catch (e) {
		console.log(e);
	}

	return null;
}

export async function doTransfer(source, destination, amount, message, blockhash) {
	let newBalance = 0;
	amount = parseFloat(amount);

	if (!source || !destination || !amount || amount < 0 || !message) {
		console.log('Invalid Request');
		return {
			success: false,
			error: 'Invalid Request'
		};
	}

	let transactionID = null;

	try {
		let sourceAddress = source.indexOf('.sol') > -1 ? await getAddressFromDomain(source) : source;
		let sourceJSON = await Functions.getSimpleWalletJSON(sourceAddress);

		if (!process.env.WHITELIST_DISABLED && !sourceJSON.isWhitelisted) {
			console.log('Access Denied');
			return {
				success: false,
				error: 'Access Denied'
			};
		}

		let messageResult = false;
		let action = 'transfer';
		let data = {
			amount: amount,
			destination: destination,
			source: source
		};

		if (!blockhash) {
			messageResult = await Functions.verifyMessage(sourceJSON, action, data, message);
		} else {
			messageResult = await Functions.verifyTransaction(sourceJSON, action, data, message, blockhash);
		}

		if (!messageResult) {
			console.log('Verification Failed');
			return {
				success: false,
				error: 'Verification Failed'
			}
		}

		let destinationAddress = destination.indexOf('.sol') > -1 ? await getAddressFromDomain(destination) : destination;
		let destinationJSON = await Functions.getSimpleWalletJSON(destinationAddress);

		let transaction = await Functions.Transaction.create('TRANSFER', sourceJSON._id, destinationJSON._id, amount);
		transactionID = transaction._id.toString();

		let success = await Functions.Transaction.handleTransferPending(transaction, sourceJSON.wallet, destinationJSON.wallet);
		if (!success) throw new Error('Failed transaction handling at pending step: ' + transactionID);
	
		success = await Functions.Transaction.handleTransferSettling(transaction, sourceJSON.wallet, destinationJSON.wallet);
		if (!success) throw new Error('Failed transaction handling at settling step: ' + transactionID);

		success = (await Functions.Transaction.setStatus(transaction._id, 'SETTLED')) != false;
		if (!success) throw new Error('Failed transaction handling at settled step: ' + transactionID);

		sourceJSON = await Models.Wallet.findById(sourceJSON._id);
		newBalance = sourceJSON.pointsBalance;
	} catch(err) {
		console.error('Error Occured', err);

		if (transactionID) {
			await Functions.Transaction.revertTransferTransaction(transactionID);
		}

		return {
			success: false,
			error: 'Error Occured'
		};
	}

	return {
		success: true,
		newBalance: newBalance
	}
}

export async function doClaimPoints(wallet, message, blockhash) {
	if (!wallet || !message) {
		console.log('Invalid Request');
		return {
			success: false,
			error: 'Invalid Request'
		};
	}

	const timestamp = Constants.getTimestamp();

	try {
		let walletJSON = await Functions.getWalletJSON(wallet);

		if (!process.env.WHITELIST_DISABLED && !walletJSON.isWhitelisted) {
			console.log('Access Denied');
			return {
				success: false,
				error: 'Access Denied'
			};
		}

		let messageResult = false;
		let action = 'claim';
		let data = {wallet: wallet};

		if (!blockhash) {
			messageResult = await Functions.verifyMessage(walletJSON, action, data, message);
		} else {
			messageResult = await Functions.verifyTransaction(walletJSON, action, data, message, blockhash);
		}

		if (!messageResult) {
			console.log('Verification Failed');
			return {
				success: false,
				error: 'Verification Failed'
			}
		}

		let tokensInWallet = await Functions.getGrimsFromTokens(wallet);
		let promises = [];

		promises.push(handleStakedGrimsNotInWallet(wallet, tokensInWallet));

		for (let i in walletJSON.walletTokens) {
			let token = walletJSON.walletTokens[i];

			promises.push(claimPoints(walletJSON, token.mint));
		}

		await Promise.all(promises);
	} catch(e) {
		console.error('Error Occured', e);
		return {
			success: false,
			error: 'Error Occured'
		};
	}

	return {
		success: true
	}
}

async function handleStakedGrimsNotInWallet(wallet, tokensInWallet) {
	const timestamp = Constants.getTimestamp();
	let promises = [];

	for (let i in wallet.walletTokens) {
		let tokenJSON = wallet.walletTokens[i];

		if (tokenJSON && tokenJSON.isStaked) {
			let inWallet = tokenJSON.inWallet;
			let isStaked = tokenJSON.isStaked;
			let penaltyTimestamp = undefined;

			if (tokensInWallet[tokenJSON.mint] == Constants.IN_WALLET_DELEGATED) {
				penaltyTimestamp = timestamp;
				inWallet = Constants.IN_WALLET_DELEGATED;
				isStaked = false;
			} else if (tokensInWallet[tokenJSON.mint] == Constants.NOT_IN_WALLET) {
				penaltyTimestamp = timestamp;
				inWallet = Constants.NOT_IN_WALLET;
				isStaked = false;
			}

			if (penaltyTimestamp) {
				let staked = await tokenJSON.getLaststakedInfo();

				if (staked.penaltyTimestamp > 0 || staked.unstakedTimestamp > 0) {
					continue;
				}

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

	await Promise.all(promises);
}

export async function doGetTokensInWallet(wallet) {
	return {
		list: await Functions.getTokensInWallet(wallet)
	};
}

export async function addWhitelist(wallet, secret) {
	if (secret && secret === "26tZN7qs66GIIWrMDwfM6gOB6eJEYx4j") {
		let walletJSON = await Functions.getWalletJSON(wallet);

		walletJSON.isWhitelisted = true;
		await walletJSON.save();

		return {
			success: true
		}
	} else {
		return {
			success: false
		}
	}
}

async function getSolPrice() {
	const timestamp = Constants.getTimestamp();
	const expireRate = 60 * 60 * 1000; // 1 hour

	let solPrice = new Models.JSONConfigs();

	try {
		solPrice = await Models.JSONConfigs.findOne({name: 'sol-price'});

		if (!solPrice || (timestamp - solPrice.timestamp) > expireRate) {
			const axios = require('axios');
			let res = await axios.get("https://min-api.cryptocompare.com/data/price?fsym=SOL&tsyms=USD&api_key=7329704356378f4dd589cdbeb3a7f0a2de1b8b45d90727ecc7ea25105d180425");

			if (res.status == 200) {
				try {
					if (!solPrice) {
						solPrice = await Models.JSONConfigs.create({name: 'sol-price', config: res.data, timestamp: timestamp});
					} else {
						solPrice.config = res.data;
						solPrice.timestamp = timestamp;
						await solPrice.save();
					}
					
				} catch (e) {
					console.log(e);
				}
			}
		}
	} catch(err) {
		console.log(err);
	}

	return solPrice;
}

async function getFloorPrice() {
	const timestamp = Constants.getTimestamp();
	const expireRate = 30 * 60 * 1000; // 30 min

	let floorPrice = new Models.JSONConfigs();

	try {
		floorPrice = await Models.JSONConfigs.findOne({name: 'floor-price'});

		if (!floorPrice || (timestamp - floorPrice.timestamp) > expireRate) {
			const axios = require('axios');
			let res = await axios.post("https://api.solanafloor.com/collections/grim-syndicate", {logsOnly: true});

			if (res.status == 200 && 'tokenFloor' in res.data) {
				try {
					let data = {
						SOL: res.data.tokenFloor
					};

					if (!floorPrice) {
						floorPrice = await Models.JSONConfigs.create({name: 'floor-price', config: data, timestamp: timestamp});
					} else {
						floorPrice.config = data;
						floorPrice.timestamp = timestamp;
						await floorPrice.save();
					}
					
				} catch (e) {
					console.log(e);
				}
			}
		}
	} catch(err) {
		console.log(err);
	}

	return floorPrice;
}

async function getStakedGrimsCount() {
	const timestamp = Constants.getTimestamp();
	const expireRate = 5 * 60 * 1000; // 5 min

	let stakedGrims = new Models.JSONConfigs();

	try {
		stakedGrims = await Models.JSONConfigs.findOne({name: 'staked-stats'});

		if (!stakedGrims || (timestamp - stakedGrims.timestamp) > expireRate) {
			let stakedTokens = await Models.Token.count({isStaked: true});
			let data = {
				GRIMS: stakedTokens
			};

			if (!stakedGrims) {
				stakedGrims = await Models.JSONConfigs.create({name: 'staked-stats', config: data, timestamp: timestamp});
			} else {
				stakedGrims.config = data;
				stakedGrims.timestamp = timestamp;
				await stakedGrims.save();
			}
		}
	} catch (e) {
		console.log(e);
	}

	return stakedGrims;
}

export async function verifyAstra(wallet, amount) {
	let walletJSON = await Models.WalletContent.findOne({wallet: wallet});
	let balance = walletJSON.pointsBalance;
	let unclaimed = 0;

	for (let i in walletJSON.walletTokens) {
		let token = walletJSON.walletTokens[i].mint;
		let walletToken = await walletJSON.getToken(token);

		let grimMetadata = Functions.getGrimMetadata(token);
		let department = 'Base' in grimMetadata && grimMetadata['Base'] in Constants.BASE_DEPARTMENTS ? Constants.BASE_DEPARTMENTS[grimMetadata['Base']] : "BASE_MYTHIC";
		let baseMultiplier = department in Constants.BASE_POINTS ? Constants.BASE_POINTS[department] : 1;
		let pointsPerTimeperiod = Constants.POINTS_PER_TIMEPERIOD * baseMultiplier;

		let [pointsUnclaimed, pointsLocked] = await getClaimablePoints(pointsPerTimeperiod, walletToken);
		unclaimed += pointsUnclaimed;
	}

	return {
		hasEnough: (balance + unclaimed) > amount,
		// balance: balance,
		// unclaimed: unclaimed,
	}
}

export async function getTransactions(wallet) {
	let walletJSON = await Models.Wallet.findOne({wallet: wallet});
	if (!walletJSON) return false;

	let transactions = await Models.Transaction.find({destination: walletJSON._id, type: "TRANSFER", status: "SETTLED"});
	let wallets = [];
	let results = [];

	for (let i in transactions) {
		wallets.push(transactions[i].source);
	}

	let walletsJSON = await Models.Wallet.find({_id: {$in: wallets}});

	for (let i in transactions) {
		for (let w in walletsJSON) {
			if (transactions[i].source.toString() == walletsJSON[w]._id.toString()) {
				results.push({
					wallet: walletsJSON[w].wallet,
					amount: transactions[i].amount
				});
				break;
			}
		}
	}

	return results;
}

export async function doRemovePenalty(wallet) {
	let walletContentJSON = await Functions.getWalletJSON(wallet);

	for (let i in walletContentJSON.walletTokens) {
		let token = walletContentJSON.walletTokens[i];
		await Models.StakeInfo.findOneAndUpdate({tokenID: token._id, penaltyTimestamp: {$gt: 0}}, {penaltyTimestamp: false});
	}
}

export async function doRemovePenalties() {
	let penalties = await Models.StakeInfo.find({penaltyTimestamp: {$gt: 0}})

	console.log(`updating ${penalties.length} penalties`)
	let i = 0
	for (let penalty of penalties) {
		await Models.StakeInfo.findOneAndUpdate({_id: penalty._id}, {penaltyTimestamp: false});
		i++
		console.log(`updated ${i}/${penalties.length} penalties`)
	}
	return penalties
}

export async function doFillStamina(wallet) {
	let walletContentJSON = await Functions.getWalletJSON(wallet);

	for (let i in walletContentJSON.walletTokens) {
		let token = walletContentJSON.walletTokens[i];
		await Models.Stamina.findOneAndUpdate({_id: token._id}, {stamina: 50});
	}
}

export async function doInternal() {
	// await Models.Stamina.collection.updateMany({stamina: {$gt: 50}},{$set: {stamina: 50}}); // fix stamina bug > 50

	// //whitelist + stamina
	// let timestamp = Constants.getTimestamp();
	// let wallets = ['8uBSCp3aHQffuwk269jzUC2YXsmRT5Z8JzrsZNdoYkKg'];
	// let walletsJSON = await Models.WalletContent.find({wallet: {$in: wallets}});

	// for (let i in walletsJSON) {
	// 	await Models.Wallet.findByIdAndUpdate(walletsJSON[i]._id, {isWhitelisted: true})

	// 	for (let t in walletsJSON[i].walletTokens) {
	// 		let token = walletsJSON[i].walletTokens[t];

	// 		let stamina = await Models.Stamina.findById(token._id);

	// 		if (!stamina) {
	// 			stamina = await Models.Stamina.create({_id: token._id});
	// 		}

	// 		await Models.Stamina.findByIdAndUpdate(token._id, {timestamp: timestamp, stamina: 500});
	// 	}
	// }

	// Migrate Stamina
	// let tokens = await Models.StakeInfo.find({unstakedTimestamp: {$exists: false}, penaltyTimestamp: {$exists: false}});

	// for (let i in tokens) {
	// 	try {
	// 		await Models.Stamina.create({_id: tokens[i].tokenID, timestamp: tokens[i].stakedTimestamp});
	// 	} catch(e) {console.log(e)}
	// }


	// let transactions = await Models.Transaction.find({destination: "621d5b56a4b280d439f61e0b"});

	// for (let i in transactions) {
	// 	let wallet = await Models.Wallet.findById(transactions[i].source);
	// 	console.log(wallet.wallet, transactions[i].amount, transactions[i].status, transactions[i].timestamp);
	// }


	// let wallets = await Models.WalletContent.find({});
	// let allWallets = [];
	// let balances = [];
	// let unclaimedBalances = [];
	// let lockedBalances = [];

	// for (let t in wallets) {
	// 	allWallets.push(wallets[t].wallet);
	// 	balances.push(wallets[t].pointsBalance);
	// 	let points = 0;
	// 	let locked = 0;

	// 	for (let i in wallets[t].walletTokens) {
	// 		let token = wallets[t].walletTokens[i].mint;
	// 		console.log(t, token)
	// 		let walletToken = await wallets[t].getToken(token);

	// 		let grimMetadata = Functions.getGrimMetadata(token);
	// 		let department = 'Base' in grimMetadata && grimMetadata['Base'] in Constants.BASE_DEPARTMENTS ? Constants.BASE_DEPARTMENTS[grimMetadata['Base']] : "BASE_MYTHIC";
	// 		let baseMultiplier = department in Constants.BASE_POINTS ? Constants.BASE_POINTS[department] : 1;
	// 		let pointsPerTimeperiod = Constants.POINTS_PER_TIMEPERIOD * baseMultiplier;

	// 		let [pointsUnclaimed, pointsLocked] = await getClaimablePoints(pointsPerTimeperiod, walletToken);
	// 		points += pointsUnclaimed;
	// 		locked += pointsLocked;
	// 	}
		
	// 	unclaimedBalances.push(points);
	// 	lockedBalances.push(locked);
	// }

	// return {
	// 	wallets: allWallets,
	// 	balances: balances,
	// 	unclaimed: unclaimedBalances,
	// 	locked: lockedBalances
	// }

	// return balances;

	// await Models.StakeInfo.collection.updateMany({claimedTimestamp: "$unstakedTimestamp"},{$set: {claimedTimestamp: 1644762859337}});
	// await Models.StakeInfo.collection.updateMany({$expr: {$eq: ["$claimedTimestamp", "$stakedTimestamp"]}, unstakedTimestamp: {$exists: true}},{$set: {claimedTimestamp: "$unstakedTimestamp"}});
	// let stakedInfos = await Models.StakeInfo.find({"pendingTransactions.0": {$exists: 1}});
	// for (let i in stakedInfos) {
	// 	let pendingTransactions = res[i].pendingTransactions;
	// 	for (let n in pendingTransactions) {
	// 		let pending = pendingTransactions[n];
	// 		let transaction = await Models.Transaction.findById(pending.transaction);

	// 		if (!transaction) {
	// 			await Models.StakeInfo.updateOn(
	// 				{
	// 					_id: res[i]._id,
	// 					'pendingTransactions': {$in: {transaction: pending.transaction, timestamp: pending.claimTimestamp}}
	// 				}, {
	// 				$pull: {pendingTransactions: {transaction: pending.transaction, timestamp: pending.claimTimestamp}}
	// 			})
	// 		}
	// 	}
	// }

	// await Models.StakeInfo.collection.updateMany({"pendingTransaction.0": {$exists: true}},{$unset: {"pendingTransaction.0": true}});
	// await Models.StakeInfo.collection.updateMany({unstakedTimestamp: {$exists: true}, penaltyTimestamp: {$exists: true}},{$unset: {penaltyTimestamp: true}});
	// await Models.WalletContent.collection.updateMany({},{$unset: {tokens: true}});
	// await Models.Token.collection.updateMany({},{$unset: {stakeInfo: true}});
	
	// let allTokens = await Models.Token.find({isStaked: {$exists: false}});

	// for (let i in allTokens) {
	// 	let token = allTokens[i];
	// 	let stakedStatus = await token.isStakedStatus();
	// 	console.log(token.mint, stakedStatus)

	// 	await Models.Token.findByIdAndUpdate(token._id, {
	// 		isStaked: stakedStatus
	// 	});
	// }
}