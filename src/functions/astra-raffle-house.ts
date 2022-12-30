import Models from '../models/index';
import Constants from '../constants';
import axios from 'axios';

const ObjectId = require('mongoose').Types.ObjectId;

export async function createWalletRaffleEntries(walletID, raffleID) {
	let data = {
		walletID: walletID,
		raffleID: raffleID
	};

	let raffleEntries = await Models.RaffleEntries.findOneAndUpdate({ walletID: walletID, raffleID: raffleID }, { $set: data }, { new: true, upsert: true, setDefaultsOnInsert: true });

	console.log('Raffle Entries initiated: ', raffleEntries._id.toString());

	return raffleEntries;
}

export async function createTransaction(walletID, raffleID, tickets, totalPrice) {
	let data = {
		walletID: walletID,
		raffleID: raffleID,
		tickets: tickets,
		totalPrice: totalPrice,
		status: 'INITIAL',
		timestamp: Constants.getTimestamp()
	};

	let raffleTransaction = await Models.RaffleTransaction.create(data);

	console.log('Raffle Tickets buying initiated: ', raffleTransaction._id.toString());

	return raffleTransaction;
}

export async function createPayment(walletID, raffleID, entries, payment) {
	let data = {
		walletID: walletID,
		raffleID: raffleID,
		entries: entries,
		payment: payment,
		status: 'INITIAL',
		timestamp: Constants.getTimestamp()
	};

	let rafflePayment = await Models.RafflePayment.create(data);

	console.log('Raffle Payment initiated: ', rafflePayment._id.toString());

	return rafflePayment;
}

export function getNINStatus(type, status, index = null) {
	const progressStatuses = ['INITIAL', 'PENDING', 'SETTLING', 'SETTLED'];
	const cancelStatuses = ['CANCEL_INITIAL', 'CANCEL_PENDING', 'CANCELED'];
	const revertStatuses = ['REVERT_INITIAL', 'REVERT_SETTLING', 'REVERT_PENDING', 'REVERTED'];

	let statuses = progressStatuses;

	if (type === "CANCEL") {
		statuses = cancelStatuses;
	}

	if (type === "REVERT") {
		statuses = revertStatuses;
	}

	if (status) {
		return statuses.splice(statuses.indexOf(status));
	}

	if (index) {
		return statuses.splice(index);
	}

	return [];
}

export async function setStatus(model, id, newStatus) {
	let raffleTransaction = await model.findOneAndUpdate(
		{
			_id: id,
			status: { $nin: getNINStatus(newStatus, null) },
			cancelStatus: { $exists: false },
			revertStatus: { $exists: false }
		}, {
		$set: {
			status: newStatus,
			timestamp: Constants.getTimestamp()
		}
	}, {
		new: true
	}
	);

	if (raffleTransaction && raffleTransaction.status !== newStatus) {
		return false;
	}

	console.log('Updating raffle transaction status: ', id.toString(), newStatus);

	return raffleTransaction;
}

export async function setCancelStatus(model, id, newStatus) {
	let raffleTransaction = await model.findOneAndUpdate(
		{
			_id: id,
			cancelStatus: { $nin: getNINStatus("CANCEL", newStatus, null) },
			revertStatus: { $nin: getNINStatus("REVERT", null, 0) }
		}, {
		$set: {
			cancelStatus: newStatus,
			timestamp: Constants.getTimestamp()
		}
	}, {
		new: true
	}
	);

	if (raffleTransaction && raffleTransaction.cancelStatus !== newStatus) {
		return false;
	}

	console.log('Updating raffle transaction status: ', id.toString(), newStatus);

	return raffleTransaction;
}

export async function setRevertStatus(model, id, newStatus) {
	let raffleTransaction = await model.findOneAndUpdate(
		{
			_id: id,
			cancelStatus: { $nin: getNINStatus("REVERT", newStatus, null) }
		}, {
		$set: {
			revertStatus: newStatus,
			timestamp: Constants.getTimestamp()
		}
	}, {
		new: true
	}
	);

	if (raffleTransaction.revertStatus !== newStatus) {
		return false;
	}

	console.log('Updating raffle transaction status: ', id.toString(), newStatus);

	return raffleTransaction;
}

export async function handleTicketsBuying(raffleTransaction) {
	let success = await setStatus(Models.RaffleTransaction, raffleTransaction._id, 'PENDING');
	if (!success) return false;

	success = await deductAstraFromWallet(raffleTransaction);
	if (!success) return false;

	success = await pendingRaffleEntries(raffleTransaction);
	if (!success) return false;

	success = await setStatus(Models.RaffleTransaction, raffleTransaction._id, 'SETTLING');

	success = await settleAstraBalance(raffleTransaction);
	if (!success) return false;

	success = await settleRaffleEntries(raffleTransaction);
	if (!success) return false;

	success = await setStatus(Models.RaffleTransaction, raffleTransaction._id, 'SETTLED');
	if (!success) return false;

	return true;
}

export async function handleRafflePayment(rafflePayment) {
	let success = await setStatus(Models.RafflePayment, rafflePayment._id, 'PENDING');
	if (!success) return false;

	success = await addAstraToWallet(rafflePayment);
	if (!success) return false;

	success = await setStatus(Models.RafflePayment, rafflePayment._id, 'SETTLING');

	success = await settleAstraPayment(rafflePayment);
	if (!success) return false;

	success = await setStatus(Models.RafflePayment, rafflePayment._id, 'SETTLED');
	if (!success) return false;

	await Models.RaffleCampaign.updateOne({
		_id: rafflePayment.raffleID,
	}, {
		beneficiaryPaymentID: rafflePayment._id,
	});

	return true;
}

export async function deductAstraFromWallet(raffleTransaction) {
	let status = await Models.Wallet.updateOne({
		_id: raffleTransaction.walletID,
		pendingTransactions: { $nin: { transaction: raffleTransaction._id, amount: -raffleTransaction.totalPrice } },
		$expr: {
			$gte: [
				"$pointsBalance",
				raffleTransaction.totalPrice
			]
		}
	}, {
		$inc: { pendingBalance: -raffleTransaction.totalPrice },
		$push: { pendingTransactions: { transaction: raffleTransaction._id, amount: -raffleTransaction.totalPrice } }
	});

	if (await isTransactionFailed(status, raffleTransaction)) {
		return false;
	}

	console.log('Deducted Astra from Wallet: ', raffleTransaction._id.toString());

	return true;
}

export async function addAstraToWallet(rafflePayment) {
	let status = await Models.Wallet.updateOne({
		_id: rafflePayment.walletID,
		pendingTransactions: {$nin: {transaction: rafflePayment._id, amount: rafflePayment.payment}}
	}, {
		$inc: {pendingBalance: rafflePayment.payment},
		$push: {pendingTransactions: {transaction: rafflePayment._id, amount: rafflePayment.payment}}
	});

	if (await isTransactionFailed(status, rafflePayment)) {
		return false;
	}

	console.log('Added Astra to Wallet: ', rafflePayment._id.toString());

	return true;
}

export async function pendingRaffleEntries(raffleTransaction) {
	let status = await Models.RaffleEntries.updateOne({
		walletID: raffleTransaction.walletID,
		raffleID: raffleTransaction.raffleID,
		pendingTransactions: { $nin: { transaction: raffleTransaction._id, amount: raffleTransaction.tickets } },
	}, {
		$inc: { pendingTickets: raffleTransaction.tickets },
		$push: { pendingTransactions: { transaction: raffleTransaction._id, amount: raffleTransaction.tickets } }
	});

	if (await isTransactionFailed(status, raffleTransaction)) {
		return false;
	}

	console.log('Pending Raffle Entries: ', raffleTransaction._id.toString());

	return true;
}

export async function settleAstraBalance(raffleTransaction) {
	let status = await Models.Wallet.updateOne({
		_id: raffleTransaction.walletID,
		pendingTransactions: { $in: { transaction: raffleTransaction._id, amount: -raffleTransaction.totalPrice } },
		$expr: {
			$gte: [
				"$pointsBalance",
				raffleTransaction.totalPrice
			]
		}
	}, {
		$inc: { pointsBalance: -raffleTransaction.totalPrice, pendingBalance: raffleTransaction.totalPrice },
		$pull: { pendingTransactions: { transaction: raffleTransaction._id, amount: -raffleTransaction.totalPrice } }
	});

	if (await isTransactionFailed(status, raffleTransaction)) {
		return false;
	}

	console.log('Settling Astra from Wallet: ', raffleTransaction._id.toString());

	return true;
}

export async function settleAstraPayment(rafflePayment) {
	let status = await Models.Wallet.updateOne({
		_id: rafflePayment.walletID,
		pendingTransactions: { $in: { transaction: rafflePayment._id, amount: rafflePayment.payment } },
	}, {
		$inc: { pointsBalance: rafflePayment.payment, pendingBalance: -rafflePayment.payment },
		$pull: { pendingTransactions: { transaction: rafflePayment._id, amount: rafflePayment.payment } }
	});

	if (await isPaymentFailed(status, rafflePayment)) {
		return false;
	}

	console.log('Settling Astra Payment from Wallet: ', rafflePayment._id.toString());

	return true;
}

export async function settleRaffleEntries(raffleTransaction) {
	let status = await Models.RaffleEntries.updateOne({
		walletID: raffleTransaction.walletID,
		raffleID: raffleTransaction.raffleID,
		pendingTransactions: { $in: { transaction: raffleTransaction._id, amount: raffleTransaction.tickets } },
	}, {
		$inc: { tickets: raffleTransaction.tickets, pendingTickets: -raffleTransaction.tickets },
		$pull: { pendingTransactions: { transaction: raffleTransaction._id, amount: raffleTransaction.tickets } }
	});

	if (await isTransactionFailed(status, raffleTransaction)) {
		return false;
	}

	console.log('Settling Raffle Entries: ', raffleTransaction._id.toString());

	return true;
}

export async function isTransactionFailed(status, raffleTransaction) {
	let failed = (status && status.acknowledged && status.modifiedCount == 0);

	if (failed) {
		let status = await revertTransaction(raffleTransaction._id, true);
		console.log('REVERTED', status);
	}

	return failed;
}


export async function isPaymentFailed(status, rafflePayment) {
	let failed = (status && status.acknowledged && status.modifiedCount == 0);

	if (failed) {
		let status = await revertPayment(rafflePayment._id, true);
		console.log('REVERTED', status);
	}

	return failed;
}

export async function revertTransaction(transactionID, forceRevert) {
	try {
		let raffleTransaction = await Models.RaffleTransaction.findOneAndUpdate(
			{
				_id: transactionID,
				status: { $ne: "SETTLED" },
				timestamp:
					forceRevert
						? { $exists: true }
						: { $lte: Constants.getTimestamp() - Constants.CANCEL_TRANSACTIONS_INTERVAL } // not changed for more than 5 min
			}, {
			$set: {
				cancelStatus: "CANCEL_INITIAL",
				timestamp: Constants.getTimestamp()
			}
		}, {
			new: true
		}
		);

		if (!raffleTransaction) return false;

		let status = raffleTransaction.status;

		raffleTransaction = await setCancelStatus(Models.RaffleTransaction, transactionID, "CANCEL_PENDING");

		if (status === "SETTLING") {
			raffleTransaction = await setRevertStatus(Models.RaffleTransaction, transactionID, "REVERT_SETTLING");

			revertSettleRaffleEntries(raffleTransaction);
			revertAstraSettle(raffleTransaction);

			status = "PENDING";
		}

		if (status === "PENDING") {
			raffleTransaction = await setRevertStatus(Models.RaffleTransaction, transactionID, "REVERT_PENDING");

			revertPendingRaffleEntries(raffleTransaction);
			revertAstraDeductFromSource(raffleTransaction);
		}

		raffleTransaction = await setRevertStatus(Models.RaffleTransaction, transactionID, "REVERTED");
		raffleTransaction = await setCancelStatus(Models.RaffleTransaction, transactionID, "CANCELED");

		return raffleTransaction.cancelStatus === "CANCELED";
	} catch (e) {
		console.log('error reverting', e);
	}

	return false;
}

export async function revertPayment(paymentID, forceRevert) {
	try {
		let rafflePayment = await Models.RafflePayment.findOneAndUpdate(
			{
				_id: paymentID,
				status: { $ne: "SETTLED" },
				timestamp:
					forceRevert
						? { $exists: true }
						: { $lte: Constants.getTimestamp() - Constants.CANCEL_TRANSACTIONS_INTERVAL } // not changed for more than 5 min
			}, {
			$set: {
				cancelStatus: "CANCEL_INITIAL",
				timestamp: Constants.getTimestamp()
			}
		}, {
			new: true
		}
		);

		if (!rafflePayment) return false;

		let status = rafflePayment.status;

		rafflePayment = await setCancelStatus(Models.RafflePayment, paymentID, "CANCEL_PENDING");

		if (status === "SETTLING") {
			rafflePayment = await setRevertStatus(Models.RafflePayment, paymentID, "REVERT_SETTLING");

			revertAstraPaymentSettle(rafflePayment);

			rafflePayment = await setStatus(Models.RaffleTransaction, paymentID, "PENDING");
			status = "PENDING";
		}

		if (status === "PENDING") {
			rafflePayment = await setRevertStatus(Models.RafflePayment, paymentID, "REVERT_PENDING");
			
			revertAstraAddToDestination(rafflePayment);
		}

		rafflePayment = await setRevertStatus(Models.RafflePayment, paymentID, "REVERTED");
		rafflePayment = await setCancelStatus(Models.RafflePayment, paymentID, "CANCELED");

		return rafflePayment.cancelStatus === "CANCELED";
	} catch (e) {
		console.log('error reverting', e);
	}

	return false;
}

export async function revertAstraSettle(raffleTransaction) {
	console.log('Revert Wallet Astra Balance Settled');
	await Models.Wallet.updateOne({
		_id: raffleTransaction.walletID,
		pendingTransactions: { $nin: { transaction: raffleTransaction.id, amount: -raffleTransaction.totalPrice } },
	}, {
		$inc: { pointsBalance: raffleTransaction.totalPrice, pendingBalance: -raffleTransaction.totalPrice },
		$push: { pendingTransactions: { transaction: raffleTransaction.id, amount: -raffleTransaction.totalPrice } }
	});

	return true;
}

export async function revertAstraPaymentSettle(rafflePayment) {
	console.log('Revert Wallet Astra Payment Settled');
	await Models.Wallet.updateOne({
		_id: rafflePayment.walletID,
		pendingTransactions: { $nin: { transaction: rafflePayment.id, amount: rafflePayment.payment } },
	}, {
		$inc: { pointsBalance: -rafflePayment.payment, pendingBalance: rafflePayment.payment },
		$push: { pendingTransactions: { transaction: rafflePayment.id, amount: rafflePayment.payment } }
	});

	return true;
}

export async function revertAstraDeductFromSource(raffleTransaction) {
	console.log('Revert Wallet Astra Balance Pending');
	await Models.Wallet.updateOne({
		_id: raffleTransaction.source,
		pendingTransactions: { $in: { transaction: raffleTransaction._id, amount: -raffleTransaction.totalPrice } }
	}, {
		$inc: { pendingBalance: raffleTransaction.totalPrice },
		$pull: { pendingTransactions: { transaction: raffleTransaction._id, amount: -raffleTransaction.totalPrice } }
	});

	return true;
}

export async function revertAstraAddToDestination(rafflePayment) {
	console.log('Revert Wallet Astra Payment');
	await Models.Wallet.updateOne({
		_id: rafflePayment.walletID,
		pendingTransactions: { $in: { transaction: rafflePayment._id, amount: -rafflePayment.payment } }
	}, {
		$inc: { pendingBalance: rafflePayment.payment },
		$pull: { pendingTransactions: { transaction: rafflePayment._id, amount: -rafflePayment.payment } }
	});

	return true;
}

export async function revertPendingRaffleEntries(raffleTransaction) {
	let status = await Models.RaffleEntries.updateOne({
		walletID: raffleTransaction.walletID,
		raffleID: raffleTransaction.raffleID,
		pendingTransactions: { $in: { transaction: raffleTransaction._id, amount: raffleTransaction.tickets } },
		$expr: {
			$gte: [
				"$pendingTickets",
				raffleTransaction.tickets
			]
		}
	}, {
		$inc: { pendingTickets: -raffleTransaction.tickets },
		$pull: { pendingTransactions: { transaction: raffleTransaction._id, amount: raffleTransaction.tickets } }
	});

	console.log('Pending Raffle Entries: ', raffleTransaction._id.toString());

	return true;
}

export async function revertSettleRaffleEntries(raffleTransaction) {
	let status = await Models.RaffleEntries.updateOne({
		walletID: raffleTransaction.walletID,
		raffleID: raffleTransaction.raffleID,
		pendingTransactions: { $nin: { transaction: raffleTransaction._id, amount: raffleTransaction.tickets } },
		$expr: {
			$gte: [
				"$tickets",
				raffleTransaction.tickets
			]
		}
	}, {
		$inc: { tickets: -raffleTransaction.tickets, pendingTickets: raffleTransaction.tickets },
		$push: { pendingTransactions: { transaction: raffleTransaction._id, amount: raffleTransaction.tickets } }
	});

	console.log('Settling Raffle Entries: ', raffleTransaction._id.toString());

	return true;
}

function shuffleArray(array) {
	for (let i = array.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[array[i], array[j]] = [array[j], array[i]];
	}
}

export async function getRaffleEntries(raffleID) {
	const raffleEntries = await Models.RaffleEntries.aggregate([
		{
			$match: {
				raffleID: ObjectId(raffleID)
			}
		},
		{
			$lookup: {
				from: 'walletcontents',
				localField: 'walletID',
				foreignField: '_id',
				as: 'wallet'
			}
		},
		{
			$unwind: {
				path: '$wallet',
				preserveNullAndEmptyArrays: true
			}
		},
		{
			$project: {
				wallet: '$wallet.wallet',
				raffleID: '$raffleID',
				tickets: '$tickets',
			}
		},
	])

	let wallets = [];

	for (let raffle of raffleEntries) {
		for (let i = 0; i < raffle.tickets; i++) {
			wallets.push(raffle.wallet)
		}
	}

	return wallets
}

async function pickWinner(entries) {
	if (Array.isArray(entries) === false) {
		throw 'Not an array'
	}
	console.log(`Entries: ${entries.length}`)
	if (entries.length == 0) {
		throw 'No entries available'
	}
	if (entries.length == 1) {
		console.log(`Winner index: 0`)
		return entries[0]
	}

	shuffleArray(entries)
	const max = entries.length - 1

	let res = await axios.get(`https://www.random.org/integers/?num=1&min=0&max=${max}&col=1&base=10&format=plain&rnd=new`);

	if (res.status == 200) {
		let index = parseInt(res.data)
		console.log(`Winner index: ${index}`)
		return entries[index]
	}

	throw 'No valid winner'
}

export async function getRaffleWinners(raffleID, winnersCount = 1, uniqueWinners = true): Promise<{error: string, winners: Array<string>, totalEntries:number}> {
	let entries = await getRaffleEntries(raffleID)
	const totalEntries = entries.length

	if (entries.length === 0) {
		return {
			error: "This raffle has no entries!",
			winners: [],
			totalEntries: 0,
		}
	}

	let winners = []

	for (let i = 0; i < winnersCount; i++) {
		try {
			let winner = await pickWinner(entries)
			console.log(`Winner: ${winner.slice(0, 4) + '...' + winner.slice(-4)}\n`)
			winners.push(winner)

			if (uniqueWinners && winnersCount > i + 1) {
				let entriesWithoutWinner = entries.filter(x => x !== winner);
				entries = entriesWithoutWinner
			}
		} catch (e) {
			console.log(e)
			break
		}
	}

	return {
		error: "",
		winners: winners,
		totalEntries: totalEntries,
	}
	/*
	fs.writeFileSync(
		`./raffle-entries/winners_${raffleID}.json`,
		JSON.stringify(winners, null, 1)
	);*/
}