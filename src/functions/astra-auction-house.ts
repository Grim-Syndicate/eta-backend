import Models from '../models/index';
import Constants from '../constants';
import Functions from './index';
import { CreateAuctionBody } from 'models/auction-house';
import { ClientSession, SaveOptions, Types } from 'mongoose';

import mongoose from './../mongodb-client';
const ObjectId = require('mongoose').Types.ObjectId;


export async function createAuction(body: CreateAuctionBody) {
	if (!body.wallet || !body.message) {
		return {
			success: false,
			error: 'Invalid wallet or message'
		}
	}

	let requiredVariables = [
		"author",
		"authorLink",
		"image",
		"startingBid",
		"tickSize"
	];
	for (let required of requiredVariables) {
		if (!body.form[required]) {
			return {
				success: false,
				error: `Missing ${required}`,
			}
		}
	}
	if (!body.form.title || !body.form.author || !body.form.authorLink || !body.form.image || !body.form.enabledFrom || !body.form.enabledTo) {
		return {
			success: false,
			error: 'Invalid Request'
		}
	}

	const blockhash = body.blockhash;
	const message = body.message;

	let messageResult = false;
	let action = 'create-edit-auction';
	let data = {
		form: body.form,
		wallet: body.wallet,
	};

	let walletJSON = await Functions.getWalletJSON(body.wallet);
	if (!walletJSON.roles.includes("RAFFLE_CREATOR")) {
		return {
			success: false,
			error: "You don't have access to this feature"
		};
	}


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


	if (!body.id) {
		console.log("generating new id");
		//make sure we only reset currentBid if this is a new auction being created!
		body.form.currentBid = 0;
		body.id = ObjectId();
	}
	try {
		await Models.AstraAuction.findOneAndUpdate({ _id: body.id }, body.form, { upsert: true });
	} catch (e) {
		console.log(e);

		return {
			success: false,
			error: 'Creating Raffle Failed'
		};
	}

	return {
		success: true
	}
}

export async function getActiveAuctions(walletID: string): Promise<{ auctions?: Array<any>, error?: string, success: boolean, astraBalance?: number }> {
	if (!walletID) {
		return {
			success: false,
			error: 'Invalid Request'
		}
	}

	try {
		let wallet = await Functions.getWalletJSON(walletID);

		if (!process.env.WHITELIST_DISABLED && !wallet.isWhitelisted) {
			console.log('Access Denied');
			return {
				success: false,
				error: 'Access Denied'
			};
		}

		const timestamp = Constants.getTimestamp();

		let raffles = await Models.AstraAuction.find({
			enabled: true,
			$and: [
				{ $or: [{ enabledFrom: { $exists: false } }, { enabledFrom: { $lte: timestamp } }] },
				{ $or: [{ enabledTo: { $exists: false } }, { enabledTo: { $gte: timestamp } }] }
			]
		}).sort({ 'title': 1 });

		if (wallet.roles && wallet.roles.includes("RAFFLE_CREATOR")) {
			let rafflesNotEnabled = await Models.AstraAuction.find({

				$and: [
					{ enabled: false },
				],
			}).sort({ 'title': 1 });

			let rafflesIds = raffles.map(a => a._id);
			let notInRaffles = rafflesNotEnabled.filter(a => !rafflesIds.includes(a._id));
			raffles = raffles.concat(notInRaffles);
		}

		let results = [];
		for (let i in raffles) {
			let entries = raffles[i].toJSON();
			results.push(entries);
		}
		results.sort((a, b) => {
			return a.title?.localeCompare(b.title);

		})
		return {
			success: true,
			auctions: results,
			astraBalance: wallet.pointsBalance
		}
	} catch {

	}
}

export async function getAuctionInfo(auctionId: string, wallet: string) {

	if (!auctionId || !wallet) {
		return {
			success: false,
			error: 'Invalid Request'
		}
	}


	let walletJSON = await Functions.getWalletJSON(wallet);
	if (!walletJSON) {
		return {
			success: false,
			error: 'Invalid Request'
		}
	}

	let auction = await Models.AstraAuction.findById(auctionId);
	if (!auction) {
		return {
			success: false,
			error: 'Invalid Request'
		}
	}

	const newMinBid = auction.currentBid ? auction.currentBid + (auction.tickSize || 0) : auction.startingBid;
	const newCurrentBid = auction.currentBid ? auction.currentBid : auction.startingBid;

	return {
		success: true,
		newMinBid: newMinBid,
		newCurrentBid: newCurrentBid,
		currentWinningWallet: auction.currentWinningWallet,
		pointsBalance: walletJSON.pointsBalance
	}
}

export async function bidOnAuction(wallet: string, auctionId: string, bid: number, currentBid: number, message, blockhash) {

	if (!wallet || !auctionId || !bid || !message || bid < 0) {
		return {
			success: false,
			error: 'Invalid Request'
		}
	}

	let walletJSON = await Functions.getWalletJSON(wallet);

	if (!process.env.WHITELIST_DISABLED && !walletJSON.isWhitelisted) {
		console.log('Access Denied');
		return {
			success: false,
			error: 'Access Denied'
		};
	}

	let auction = await Models.AstraAuction.findById(auctionId);

	//Check if someone else has bid whilst the request happened
	if (auction.tickSize) {
		const currentBid = auction.currentBid ? auction.currentBid : auction.startingBid;

		const newMinBid = auction.currentBid ? auction.currentBid + (auction.tickSize || 0) : auction.startingBid;
		const newCurrentBid = auction.currentBid ? auction.currentBid : auction.startingBid;
		if (auction.currentBid && bid < currentBid + auction.tickSize) {
			return {
				newMinBid: newMinBid,
				newCurrentBid: newCurrentBid,
				success: false,
				error: `Someone else has already bid that amount!`,
			}
		}
	}

	if (!auction) {
		console.log('Auction not found!');
		return {
			success: false,
			error: 'Invalid Request'
		}
	}
	const date = new Date();
	const now = Math.floor(date.getTime());// / 1000);
	if (now < auction.enabledFrom) {

		return {
			success: false,
			error: `This auction hasn't started yet`,
		}
	}
	if (now > auction.enabledTo) {

		return {
			success: false,
			error: `This auction has already ended`,
		}
	}
	if (!walletJSON || walletJSON.pointsBalance < auction.currentBid) {
		return {
			success: false,
			error: `You don't have enough astra!`,
		}
	}
	let messageResult = false;
	const action = 'bid-on-auction';
	const data = {
		auction: auctionId,
		bid: bid,
		currentBid: currentBid,
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
	const mongoClient = await mongoose;

	const session: ClientSession = await mongoClient.startSession();
	try {
		const date = new Date();
		const unix = Math.floor(date.getTime() / 1000);
		//This batches the below queries together, if any of them fail then it'll revert all of them.
		const transactionResults = await session.withTransaction(async () => {

			let eq = [
				"$currentBid",
				(bid - auction.tickSize)
			]

			//No bid on this auction yet, we gotta go off the starting bid instead
			if (!auction.currentBid) {
				eq = [
					"$startingBid",
					currentBid
				]
			}
			let matchedAuction = await Models.AstraAuction.findOne({
				_id: auctionId,
				$expr: {
					$eq: eq
				}
			});

			if (!matchedAuction) {
				console.log("auction not found, aborting");
				await session.abortTransaction();
				return;
			}

			const currentWinner = matchedAuction.currentWinningWallet;

			if (currentWinner) {

				let currentWinnerDbWallet = await Functions.getWalletJSON(currentWinner);

				if (currentWinnerDbWallet) {
					//Give astra back to the previous bidder as they've been outbid!
					let giveAstraBackToPreviousResult = await Models.Wallet.updateOne({
						_id: currentWinnerDbWallet._id,
					}, {
						$inc: { pointsBalance: auction.currentBid },
					}, { session });

					let giveAstraBackToPreviousResultFailed = (giveAstraBackToPreviousResult && giveAstraBackToPreviousResult.acknowledged && giveAstraBackToPreviousResult.modifiedCount == 0);
					if (giveAstraBackToPreviousResultFailed) {
						console.log("giveAstraBackToPreviousResultFailed, aborting");
						await session.abortTransaction();
						return;
					}

					let walletTransaction = await createTransaction("OUTBID_ON_AUCTION", auction._id, -auction.currentBid , currentWinnerDbWallet._id, session);
					if (!walletTransaction || !walletTransaction._id) {

						console.log("Failed creating transaction, aborting");
						await session.abortTransaction();
						return;
					}

				} else {
					console.log("currentWinnerDbWallet not found", currentWinner);
				}
			}

			let updateAuctionBidResult = await Models.AstraAuction.updateOne({
				_id: auctionId,
				$expr: {
					$eq: eq
				}
			}, {
				$set: {
					currentBid: bid,
					currentWinningWallet: walletJSON.wallet
				},
				$push: { bidHistory: { wallet: walletJSON.wallet, bid: bid, timestamp: unix } }
			}, { session });

			let updateAuctionBidResultFailed = (updateAuctionBidResult && updateAuctionBidResult.acknowledged && updateAuctionBidResult.modifiedCount == 0);
			if (updateAuctionBidResultFailed) {
				console.log("updateAuctionBidResult, aborting");
				await session.abortTransaction();
				return;
			}

			let status = await Models.Wallet.updateOne({
				_id: walletJSON._id,
				$expr: {
					$gte: [
						"$pointsBalance",
						bid
					]
				}
			}, {
				$inc: { pointsBalance: -bid },
			}, { session });

			let failed = (status && status.acknowledged && status.modifiedCount == 0);
			if (failed) {
				console.log("Failed, aborting");
				await session.abortTransaction();
				return;
			}


			let walletTransaction = await createTransaction("BID_ON_AUCTION", auction._id, bid, walletJSON._id, session);
			if (!walletTransaction || !walletTransaction._id) {

				console.log("Failed creating transaction, aborting");
				await session.abortTransaction();
				return;
			}
		});

		if (transactionResults === undefined) {
			console.log("Soemthing went wrong creating a new bid");

			//grab it again from the database just to make sure we wont have any issues w/ out of date bids etc
			auction = await Models.AstraAuction.findById(auctionId);

			const newMinBid = auction.currentBid ? auction.currentBid + (auction.tickSize || 0) : auction.startingBid;
			const newCurrentBid = auction.currentBid ? auction.currentBid : auction.startingBid;
			return {
				success: false,
				error: "Something went wrong, try again",
				newMinBid: newMinBid,
				newCurrentBid: newCurrentBid
			}
		}

	} catch (e) {
		console.log("The transaction was aborted due to an unexpected error: ", e);
	} finally {
		await session.endSession();
	}

	//Everything was okay!

	//grab it again from the database just to make sure we wont have any issues w/ out of date bids etc
	auction = await Models.AstraAuction.findById(auctionId);

	const newMinBid = auction.currentBid ? auction.currentBid + (auction.tickSize || 0) : auction.startingBid;
	const newCurrentBid = auction.currentBid ? auction.currentBid : auction.startingBid;
	return {
		success: true,
		newMinBid: newMinBid,
		newCurrentBid: newCurrentBid,
		currentWinningWallet: auction.currentWinningWallet,
	}
}

export async function getPastAuctions() {
	try {
		const timestamp = Constants.getTimestamp();

		let auctions = await Models.AstraAuction.find({
			enabled: true,
			$and: [{enabledTo: {$lte: timestamp}}]
		}).sort({'enabledTo': 1});

		let results = [];

		for (let i in auctions) {
			let auction = auctions[i].toJSON();

			results.push(auction);
		}

		return {
			success: true,
			auctions: results,
		}
	} catch {

	}
}

async function createTransaction(type: "BID_ON_AUCTION" | "OUTBID_ON_AUCTION", auctionId: Types.ObjectId, amount: number, walletId: Types.ObjectId, session: ClientSession) {
	let transaction = {
		type: type,
		source: auctionId,
		amount: amount,
		status: 'COMPLETE',
		timestamp: Constants.getTimestamp(),
		extraData: {
			auctionId: auctionId,
		}
	};

	if (walletId) {
		transaction['destination'] = walletId;
	}
	let opt: SaveOptions = {
		"session": session
	};

	let t = await Models.Transaction.create([transaction], opt);
	return t[0];
}