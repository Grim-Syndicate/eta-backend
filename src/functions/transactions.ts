import Models from '../models/index';
import Constants from '../constants';

export default {
	create: async function(type, sourceID, destinationID, amount, stakeInfoID = null, claimTimestamp = null, hasLockedPoints = null) {
		let transaction = {
			type: type,
			source: sourceID,
			amount: amount,
			status: 'INITIAL',
			timestamp: Constants.getTimestamp()
		};

		if (destinationID) {
			transaction['destination'] = destinationID;
		}

		if (stakeInfoID) {
			transaction['stakeInfoID'] = stakeInfoID;
		}

		if (claimTimestamp) {
			transaction['claimTimestamp'] = claimTimestamp;
		}

		if (hasLockedPoints) {
			transaction['hasLockedPoints'] = hasLockedPoints;
		}

		let t = await Models.Transaction.create(transaction);

		console.log('Transaction created: ', t._id.toString());

		return t;
	},

	getNINStatus: function(type, status, index) {
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
			return statuses.splice( statuses.indexOf(status) );
		}

		if (index) {
			return statuses.splice( index );
		}

		return [];
	},

	setStatus: async function(id, newStatus) {
		let transaction = await Models.Transaction.findOneAndUpdate(
			{
				_id: id,
				status: {$nin: this.getNINStatus(null, newStatus, null)},
				cancelStatus: {$exists: false},
				revertStatus: {$exists: false}
			}, {
				$set: {
					status: newStatus, 
					timestamp: Constants.getTimestamp()
				}
			}, {
				new: true
			}
		);

		if (transaction.status !== newStatus) {
			return false;
		}

		console.log('Updating transaction: ', id.toString(), newStatus);

		return transaction;
	},

	setCancelStatus: async function(id, newStatus) {
		let transaction = await Models.Transaction.findOneAndUpdate(
			{
				_id: id,
				cancelStatus: {$nin: this.getNINStatus("CANCEL", newStatus, null)},
				revertStatus: {$nin: this.getNINStatus("REVERT", null, 0)}
			}, {
				$set: {
				cancelStatus: newStatus, 
				timestamp: Constants.getTimestamp()
			}
			}, {
				new: true
			}
		);

		if (transaction.cancelStatus !== newStatus) {
			return false;
		}

		console.log('Updating transaction: ', id.toString(), newStatus);

		return transaction;
	},

	setRevertStatus: async function(id, newStatus) {
		let transaction = await Models.Transaction.findOneAndUpdate(
			{
				_id: id,
				cancelStatus: {$nin: this.getNINStatus("REVERT", newStatus, null)}
			}, {
				$set: {
				revertStatus: newStatus, 
				timestamp: Constants.getTimestamp()
			}
			}, {
				new: true
			}
		);

		if (transaction.revertStatus !== newStatus) {
			return false;
		}

		console.log('Updating transaction: ', id.toString(), newStatus);

		return transaction;
	},

	handleTransferPending: async function(transaction, sourceWallet, destinationWallet) {
		let success = await this.setStatus(transaction._id, 'PENDING');
		if (!success) return false;

		success = await this.deductAstraFromSource(transaction, sourceWallet);
		if (!success) return false;

		success = await this.addAstraToDestination(transaction, destinationWallet);
		if (!success) return false;

		return true;
	},

	handleTransferSettling: async function(transaction, sourceWallet, destinationWallet) {
		let success = await this.setStatus(transaction._id, 'SETTLING');
		if (!success) return false;

		success = await this.settleAstraSource(transaction, sourceWallet);
		if (!success) return false;

		success = await this.settleAstraDestination(transaction, destinationWallet);
		if (!success) return false;

		return true;
	},

	handleClaimPending: async function(transaction, wallet) {
		let success = await this.setStatus(transaction._id, 'PENDING');
		if (!success) return false;

		success = await this.updateClaimPending(transaction);
		if (!success) return false;

		success = await this.addAstraToDestination(transaction, wallet);
		if (!success) return false;

		return true;
	},

	handleClaimSettling: async function(transaction, wallet) {
		let success = await this.setStatus(transaction._id, 'SETTLING');
		if (!success) return false;

		success = await this.updateClaimSettling(transaction);
		if (!success) return false;

		success = await this.settleAstraDestination(transaction, wallet);
		if (!success) return false;

		return true;
	},

	handleRewardPending: async function(transaction, wallet) {
		let success = await this.setStatus(transaction._id, 'PENDING');
		if (!success) return false;

		success = await this.addAstraToDestination(transaction, wallet);
		if (!success) return false;

		return true;
	},

	handleRewardSettling: async function(transaction, wallet) {
		let success = await this.setStatus(transaction._id, 'SETTLING');
		if (!success) return false;

		success = await this.settleAstraDestination(transaction, wallet);
		if (!success) return false;

		return true;
	},

	deductAstraFromSource: async function(transaction, wallet) {
		let status = await Models.Wallet.updateOne({
			_id: transaction.source,
			pendingTransactions: {$nin: {transaction: transaction._id, amount: -transaction.amount}},
			$expr: {
				$gte: [
					"$pointsBalance",
					transaction.amount
				]
			}
		}, {
			$inc: {pendingBalance: -transaction.amount},
			$push: {pendingTransactions: {transaction: transaction._id, amount: -transaction.amount}}
		});

		if (await this.isTransactionFailed(status, transaction)) {
			return false;
		}

		console.log('Source Wallet updated: ', wallet, transaction._id.toString());

		return true;
	},

	revertAstraDeductFromSource: async function(transaction) {
		console.log('Revert Source Pending');
		await Models.Wallet.updateOne({
			_id: transaction.source,
			pendingTransactions: {$in: {transaction: transaction._id, amount: -transaction.amount}}
		}, {
			$inc: {pendingBalance: transaction.amount},
			$pull: {pendingTransactions: {transaction: transaction._id, amount: -transaction.amount}}
		});

		return true;
	},

	addAstraToDestination: async function(transaction, wallet) {
		let status = await Models.Wallet.updateOne({
			_id: transaction.destination,
			pendingTransactions: {$nin: {transaction: transaction._id, amount: transaction.amount}}
		}, {
			$inc: {pendingBalance: transaction.amount},
			$push: {pendingTransactions: {transaction: transaction._id, amount: transaction.amount}}
		});

		if (await this.isTransactionFailed(status, transaction)) {
			return false;
		}

		console.log('Destination Wallet updated: ', wallet, transaction._id.toString());

		return true;
	},

	revertAstraAddToDestination: async function(transaction) {
		console.log('Revert Destination Pending');
		await Models.Wallet.updateOne({
			_id: transaction.destination,
			pendingTransactions: {$in: {transaction: transaction._id, amount: transaction.amount}}
		}, {
			$inc: {pendingBalance: -transaction.amount},
			$pull: {pendingTransactions: {transaction: transaction._id, amount: transaction.amount}}
		});

		return true;
	},

	settleAstraSource: async function(transaction, wallet) {
		let status = await Models.Wallet.updateOne({
			_id: transaction.source,
			pendingTransactions: {$in: {transaction: transaction._id, amount: -transaction.amount}},
			$expr: {
				$gte: [
					"$pointsBalance",
					transaction.amount
				]
			}
		}, {
			$inc: {pointsBalance: -transaction.amount, pendingBalance: transaction.amount},
			$pull: {pendingTransactions: {transaction: transaction._id, amount: -transaction.amount}}
		});

		if (await this.isTransactionFailed(status, transaction)) {
			return false;
		}

		console.log('Settling Source Wallet: ', wallet, transaction._id.toString());

		return true;
	},

	revertAstraSettleSource: async function(transaction) {
		console.log('Revert Source Settled');
		await Models.Wallet.updateOne({
			_id: transaction.source,
			pendingTransactions: {$nin: {transaction: transaction.id, amount: -transaction.amount}},
		}, {
			$inc: {pointsBalance: transaction.amount, pendingBalance: -transaction.amount},
			$push: {pendingTransactions: {transaction: transaction.id, amount: -transaction.amount}}
		});

		return true;
	},

	settleAstraDestination: async function(transaction, wallet) {
		let status = await Models.Wallet.updateOne({
			_id: transaction.destination,
			pendingTransactions: {$in: {transaction: transaction._id, amount: transaction.amount}}
		}, {
			$inc: {pointsBalance: transaction.amount, pendingBalance: -transaction.amount},
			$pull: {pendingTransactions: {transaction: transaction._id, amount: transaction.amount}}
		});

		if (await this.isTransactionFailed(status, transaction)) {
			return false;
		}

		console.log('Settling Destination Wallet: ', wallet, transaction._id.toString());

		return true;
	},

	revertAstraSettleDestination: async function(transaction) {
		console.log('Revert Destination Settled');
		await Models.Wallet.updateOne({
			_id: transaction.destination,
			pendingTransactions: {$nin: {transaction: transaction.id, amount: transaction.amount}}
		}, {
			$inc: {pointsBalance: -transaction.amount, pendingBalance: transaction.amount},
			$push: {pendingTransactions: {transaction: transaction.id, amount: transaction.amount}}
		});

		return true;
	},

	isTransactionFailed: async function(status, transaction) {
		let failed = (status && status.acknowledged && status.modifiedCount == 0);

		if (failed) {
			let status = transaction.type === "TRANSFER" ? await this.revertTransferTransaction(transaction._id) : await this.revertClaimTransaction(transaction._id);
			console.log('REVERTED', status);
		}

		return failed;
	},

	revertTransferTransaction: async function(transactionID) {
		try {
			let transaction = await Models.Transaction.findOneAndUpdate(
				{
					_id: transactionID,
					type: "TRANSFER",
					status: {$ne: "SETTLED"},
					timestamp: {$lte: Constants.getTimestamp() - Constants.CANCEL_TRANSACTIONS_INTERVAL} // not changed for more than 5 min
				}, {
					$set: {
						cancelStatus: "CANCEL_INITIAL",
						timestamp: Constants.getTimestamp()
					}
				}, {
					new: true
				}
			);

			if (!transaction) return false;

			let status = transaction.status;

			transaction = await this.setCancelStatus(transactionID, "CANCEL_PENDING");

			if (status === "SETTLING") {
				transaction = await this.setRevertStatus(transactionID, "REVERT_SETTLING");

				this.revertAstraSettleDestination(transaction);

				this.revertAstraSettleSource(transaction);

				status = "PENDING";
			}

			if (status === "PENDING") {
				transaction = await this.setRevertStatus(transactionID, "REVERT_PENDING");

				this.revertAstraAddToDestination(transaction);

				this.revertAstraDeductFromSource(transaction);

			}
			
			transaction = await this.setRevertStatus(transactionID, "REVERTED");
			transaction = await this.setCancelStatus(transactionID, "CANCELED");

			return transaction.cancelStatus === "CANCELED";
		} catch(e) {
			console.log(e);
		}

		return false;
	},

	revertClaimTransaction: async function(transactionID) {
		try {
			let transaction = await Models.Transaction.findOne(
				{
					_id: transactionID,
					type: "CLAIM",
					status: "SETTLING",
					timestamp: {$lte: Constants.getTimestamp() - Constants.CANCEL_TRANSACTIONS_INTERVAL} // not changed for more than 5 min
				}
			);

			if (transaction) {
				// Claim might have finished, so we need to check if only the last status was not updated
				let stakeInfo = await Models.StakeInfo.findOne({
					'_id': transaction.stakeInfoID,
					'pendingTransactions': {$nin: {transaction: transaction._id, timestamp: transaction.claimTimestamp}},
					'claimedTimestamp': transaction.claimTimestamp
				});

				if (stakeInfo) {
					// stake info claim has been complete
					// Check if wallet has been updated
					let wallet = await Models.Wallet.findOne({
						_id: transaction.destination,
						pendingTransactions: {$nin: {transaction: transaction.id, amount: transaction.amount}}
					});

					if (!wallet) {
						// try claiming wallet
						let success = await this.settleAstraDestination(transaction, '');
						if (!success) return false;
					}
					
					// wallet has been claimed
					// we don't need to revert anything
					let success = await this.setStatus(transaction._id, 'SETTLED');
					if (!success) return false;

					return true;
				}
			}

			// claim was not complete, so try to revert it
			transaction = await Models.Transaction.findOneAndUpdate(
				{
					_id: transactionID,
					type: "CLAIM",
					status: {$ne: "SETTLED"},
					timestamp: {$lte: Constants.getTimestamp() - Constants.CANCEL_TRANSACTIONS_INTERVAL} // not changed for more than 5 min
				}, {
					$set: {
						cancelStatus: "CANCEL_INITIAL",
						timestamp: Constants.getTimestamp()
					}
				}, {
					new: true
				}
			);

			if (!transaction) return false;

			let status = transaction.status;

			transaction = await this.setCancelStatus(transactionID, "CANCEL_PENDING");

			if (status === "PENDING") {
				transaction = await this.setRevertStatus(transactionID, "REVERT_PENDING");

				this.revertAstraAddToDestination(transaction);

				this.revertClaimPending(transaction);
			}

			transaction = await this.setRevertStatus(transactionID, "REVERTED");
			transaction = await this.setCancelStatus(transactionID, "CANCELED");

			return transaction.cancelStatus === "CANCELED";
		} catch(e) {
			console.log(e);
		}

		return false;
	},

	updateClaimPending: async function(transaction) {
		let status = await Models.StakeInfo.updateOne({
			'_id': transaction.stakeInfoID,
			'pendingTransactions': {$nin: {transaction: transaction._id, timestamp: transaction.claimTimestamp}},
			// 'pendingTransactions.0': {$exists: false},
			'claimedTimestamp': {$ne: transaction.claimTimestamp}
		}, {
			$push: {pendingTransactions: {transaction: transaction._id, timestamp: transaction.claimTimestamp}}
		});

		if (await this.isTransactionFailed(status, transaction)) {
			return false;
		}

		console.log('Stake Info updated: ', transaction.stakeInfoID._id.toString(), transaction._id.toString());

		return true;
	},

	revertClaimPending: async function(transaction) {
		console.log('Revert Claim Pending');
		await Models.StakeInfo.updateOne({
			'_id': transaction.stakeInfoID,
			'pendingTransactions': {$in: {transaction: transaction._id, timestamp: transaction.claimTimestamp}},
		}, {
			$pull: {pendingTransactions: {transaction: transaction._id, timestamp: transaction.claimTimestamp}}
		});

		return true;
	},

	updateClaimSettling: async function(transaction) {
		let status = await Models.StakeInfo.updateOne({
			'_id': transaction.stakeInfoID,
			// 'pendingTransactions.0': {transaction: transaction._id, timestamp: transaction.claimTimestamp},
			'pendingTransactions': {$in: {transaction: transaction._id, timestamp: transaction.claimTimestamp}},
			'claimedTimestamp': {$ne: transaction.claimTimestamp}
		}, {
			claimedTimestamp: transaction.claimTimestamp,
			hasClaimablePoint: transaction.hasLockedPoints,
			$pull: {pendingTransactions: {transaction: transaction._id, timestamp: transaction.claimTimestamp}}
		});

		if (await this.isTransactionFailed(status, transaction)) {
			return false;
		}

		console.log('Stake Info updated: ', transaction.stakeInfoID._id.toString(), transaction._id.toString());

		return true;
	},

	cancelAllTransferTransactions: async function() {
		let transactions = [];

		try {
			transactions = await Models.Transaction.find(
				{
					type: "TRANSFER",
					status: {$ne: "SETTLED"},
					cancelStatus: {$ne: "CANCELED"},
					revertStatus: {$ne: "REVERTED"},
					timestamp: {$lte: Constants.getTimestamp() - Constants.CANCEL_TRANSACTIONS_INTERVAL} // not changed for more than 5 min
				}
			);
		} catch (e) {
			console.log(e);
		}

		console.log('transactions', transactions.length)

		for (let i in transactions) {
			try {
				await this.revertTransferTransaction(transactions[i]._id);
			} catch (e) {
				console.log(e);
			}
		}

		return true;
	},

	cancelAllClaimTransactions: async function() {
		let transactions = [];
		
		try {
			transactions = await Models.Transaction.find(
				{
					type: "CLAIM",
					status: {$ne: "SETTLED"},
					cancelStatus: {$ne: "CANCELED"},
					revertStatus: {$ne: "REVERTED"},
					timestamp: {$lte: Constants.getTimestamp() - Constants.CANCEL_TRANSACTIONS_INTERVAL} // not changed for more than 5 min
				}
			);
		} catch (e) {
			console.log(e);
		}

		console.log('transactions', transactions.length)

		for (let i in transactions) {
			try {
				await this.revertClaimTransaction(transactions[i]._id);
			} catch (e) {
				console.log(e);
			}
		}

		return true;
	},
}