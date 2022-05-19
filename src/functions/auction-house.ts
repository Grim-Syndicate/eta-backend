import Models from '../models/index';
import Constants from '../constants';

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
