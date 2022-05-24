import Models from './models/index';
import Constants from './constants';
import Functions from './functions/index';

export async function getActiveAuctions(walletID) {
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

		let raffles = await Models.RaffleCampaign.find({
			enabled: true,
			$and:[
				{$or: [{enabledFrom: {$exists: false}}, {enabledFrom: {$lte: timestamp}}]},
				{$or: [{enabledTo: {$exists: false}}, {enabledTo: {$gte: timestamp}}]}
			]
		}).sort({'enabledTo': 1});

		let results = [];

		for (let i in raffles) {
			let entries = raffles[i].toJSON();
			let walletEntries = await Models.RaffleEntries.findOne({walletID: wallet._id, raffleID: raffles[i]._id});
			let totalEntries = await Models.RaffleEntries.find({raffleID: raffles[i]._id});
			let totalTickets = 0;
			for (let i in totalEntries) {
				totalTickets += totalEntries[i].tickets;
			}
			entries.walletTickets = walletEntries?.tickets;
			entries.totalTickets = totalTickets;

			results.push(entries);
		}

		return {
			success: true,
			raffles: results,
			astraBalance: wallet.pointsBalance
		}
	} catch {
		
	}
}

export async function getPastRaffles() {
	try {
		const timestamp = Constants.getTimestamp();

		let raffles = await Models.RaffleCampaign.find({
			enabled: true,
			$and: [{enabledTo: {$lte: timestamp}}]
		}).sort({'enabledTo': 1});

		let results = [];

		for (let i in raffles) {
			let entries = raffles[i].toJSON();
			let totalEntries = await Models.RaffleEntries.find({raffleID: raffles[i]._id});
			let totalTickets = 0;
			for (let i in totalEntries) {
				totalTickets += totalEntries[i].tickets;
			}
			entries.totalTickets = totalTickets;

			results.push(entries);
		}

		return {
			success: true,
			raffles: results,
		}
	} catch {
		
	}
}

export async function getMyRaffles(walletID) {
	try {
		const wallet = await Functions.getWalletJSON(walletID);
		const raffleEntries = await Models.RaffleEntries
			.find({
				walletID: wallet._id
			})
			.sort({"_id": -1});

		const raffleIDs = raffleEntries.map(entry => entry.raffleID)
		const raffles = await Models.RaffleCampaign.find({ $in: { _id: raffleIDs }});
		
		const raffleMap = {}

		for (let i in raffles) {
			const raffle = raffles[i].toJSON();
			raffleMap[raffle._id] = raffle
		}

		const results = [];

		for (let i in raffleEntries) {
			const entry = raffleEntries[i].toJSON();
			entry.entryDate = dateFromObjectId(entry._id);
			const raffle = raffleMap[entry.raffleID]
			entry.totalCost = raffle.ticketPrice * entry.tickets;
			entry.raffle = raffle
			const timestamp = Constants.getTimestamp();
			entry.raffle.ended = timestamp > raffle.enabledTo;
			results.push(entry);
		}

		return {
			success: true,
			raffles: results
		};
	} catch (err) {
		console.log(err, walletID);

		return {
			success: false,
			error: 'Getting My Raffles Failed'
		};
	}
	
}

export async function buyTickets(wallet, raffleID, tickets, message, blockhash) {
	const isTicketAmountGreaterThanOne = tickets >= 1
	const isTicketAmountWholeNumber  = Number.isInteger(tickets)

	if (!wallet || !raffleID || !tickets || !message || !isTicketAmountGreaterThanOne || !isTicketAmountWholeNumber) {
		return {
			success: false,
			error: 'Invalid Request'
		}
	}

	let walletJSON = await Functions.getWalletJSON(wallet);

	if (!process.env.WHITELIST_DISABLED && !wallet.isWhitelisted) {
		console.log('Access Denied');
		return {
			success: false,
			error: 'Access Denied'
		};
	}

	let raffle = await Models.RaffleCampaign.findById(raffleID)

	if (!raffle) {
		console.log('Raffle not found!');
		return {
			success: false,
			error: 'Invalid Request'
		}
	}

	if(raffle.maxTickets && raffle.maxTickets > 0 && tickets > raffle.maxTickets){
		console.log('Went higher than available tickets!');
		return {
			success: false,
			error: 'Maximum tickets reached'
		}
	}

	let previousEntry = await Models.RaffleEntries.findOne({walletID: walletJSON._id, raffleID: raffleID })

	if(previousEntry && (tickets + previousEntry.tickets + previousEntry.pendingTickets) > raffle.maxTickets){
		console.log('Went higher than available tickets not found!');
		return {
			success: false,
			error: 'Maximum tickets reached'
		}
	}

	let messageResult = false;
	const action = 'buy-ticket';
	const data = {
		raffle: raffleID,
		tickets: tickets,
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
	
	const timestamp = Constants.getTimestamp();

	let raffleEntries = {};

	try {
		let raffleTransaction = await Functions.AuctionHouse.createTransaction(walletJSON._id, raffle._id, parseInt(tickets), parseInt(tickets) * raffle.ticketPrice);
		raffleEntries = await Functions.AuctionHouse.createWalletRaffleEntries(walletJSON._id, raffle._id);
		let success = await Functions.AuctionHouse.handleTicketsBuying(raffleTransaction);
		if (!success) throw new Error('Failed tickets buying: ' + raffleTransaction._id);
	} catch (e) {
		console.log(e);

		// await Functions.Questing.revertQuestStarting(questExecution, true);

		return {
			success: false,
			error: 'Buying Raffle Tickets Failed'
		};
	}

	return {
		success: true,
		raffle: raffle,
		raffleEntries: raffleEntries
	}
}

const dateFromObjectId = (objectId) => {
	const objectIdStr = objectId.toString().substring(0, 8)
	return parseInt(objectIdStr, 16) * 1000;
};