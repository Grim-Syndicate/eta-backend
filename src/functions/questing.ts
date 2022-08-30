import { HydratedDocument, Types } from 'mongoose';
import Models from '../models/index';
import Constants from '../constants';
import Transaction from './transactions';
import { IQuestClaim } from '../models/quest-claim'
import { ITransaction } from '../models/transaction';

export async function createStart(walletID, questID, participants, stamina, duration) {
	let quest = {
		walletID: walletID,
		questID: questID,
		participants: participants,
		stamina: stamina,
		status: 'INITIAL',
		timestamp: Constants.getTimestamp(),
		finishTimestamp: Constants.getTimestamp() + duration
	};

	let questExecution = await Models.QuestExecution.create(quest);

	console.log('Quest starting: ', questExecution._id.toString());

	return questExecution;
}

export async function createFinish(questID, participants) {
	let quest = {
		questExecutionID: questID,
		participants: participants,
		status: 'INITIAL',
		timestamp: Constants.getTimestamp()
	};

	let questCompletion = await Models.QuestCompletion.create(quest);

	console.log('Quest finishing: ', questCompletion._id.toString());

	return questCompletion;
}

export async function createClaim(questID, type, amount): Promise<HydratedDocument<IQuestClaim>> {
	let quest = {
		questExecutionID: questID,
		type: type,
		amount: amount,
		status: 'INITIAL',
		timestamp: Constants.getTimestamp()
	};

	let questClaim = await Models.QuestClaim.create(quest);

	console.log('Claiming Rewards: ', questClaim._id.toString());

	return questClaim;
}

export function getNINStatus(type, status, index) {
	const progressStatuses = ['INITIAL', 'PENDING', 'SETTLING', 'STARTED', 'COMPLETE', 'CLAIMED'];
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
	let quest = await model.findOneAndUpdate(
		{
			_id: id,
			status: { $nin: getNINStatus(null, newStatus, null) },
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

	if (quest && quest.status !== newStatus) {
		return false;
	}

	console.log('Updating quest status: ', id.toString(), newStatus);

	return quest;
}

export async function setCancelStatus(model, id, newStatus) {
	let quest = await model.findOneAndUpdate(
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

	if (quest && quest.cancelStatus !== newStatus) {
		return false;
	}

	console.log('Updating quest status: ', id.toString(), newStatus);

	return quest;
}

export async function setRevertStatus(model, id, newStatus) {
	let quest = await model.findOneAndUpdate(
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

	if (quest.revertStatus !== newStatus) {
		return false;
	}

	console.log('Updating quest status: ', id.toString(), newStatus);

	return quest;
}

export async function handleQuestStarting(questExecution) {
	let success = await setStatus(Models.QuestExecution, questExecution._id, 'PENDING');
	if (!success) return false;

	for (let i in questExecution.participants) {
		let participant = questExecution.participants[i];
		success = await initPendingStaminaForParticipant(questExecution, participant);
		if (!success) return false;
	}

	success = await setStatus(Models.QuestExecution, questExecution._id, 'SETTLING');

	for (let i in questExecution.participants) {
		let participant = questExecution.participants[i];
		success = await settleStaminaForParticipant(questExecution, participant);
		if (!success) return false;
	}

	success = await setStatus(Models.QuestExecution, questExecution._id, 'STARTED');
	if (!success) return false;

	return true;
}

export async function revertQuestStarting(questExecution, forceRevert = false) {
	try {
		questExecution = await Models.QuestExecution.findOneAndUpdate(
			{
				_id: questExecution._id,
				status: { $nin: getNINStatus(null, 'STARTED', null) },
				cancelStatus: { $ne: "CANCELED" },
				revertStatus: { $ne: "REVERTED" },
				timestamp: (
					forceRevert
						? { $exists: true }
						: { $lte: Constants.getTimestamp() - Constants.CANCEL_QUEST_INTERVAL } // not changed for more than 5 min
				)
			}, {
			$set: {
				cancelStatus: "CANCEL_INITIAL",
				timestamp: Constants.getTimestamp()
			}
		}, {
			new: true
		}
		);

		if (!questExecution) return false;

		let status = questExecution.status;

		questExecution = await setCancelStatus(Models.QuestExecution, questExecution._id, "CANCEL_PENDING");

		if (status === "SETTLING") {
			questExecution = await setRevertStatus(Models.QuestCompletion, questExecution._id, "REVERT_SETTLING");
			let success = true;

			for (let i in questExecution.participants) {
				let participant = questExecution.participants[i];

				try {
					await revertStaminaForParticipant(questExecution, participant);
				} catch (e) { }
			}

			status = "PENDING";
		}

		if (status === "PENDING") {
			questExecution = await setRevertStatus(Models.QuestExecution, questExecution._id, "REVERT_PENDING");
			let success = true;

			for (let i in questExecution.participants) {
				let participant = questExecution.participants[i];

				try {
					await revertPendingStaminaForParticipant(questExecution, participant);
				} catch (e) { }
			}
		}

		questExecution = await setRevertStatus(Models.QuestExecution, questExecution._id, "REVERTED");
		questExecution = await setCancelStatus(Models.QuestExecution, questExecution._id, "CANCELED");

		return questExecution.cancelStatus === "CANCELED";
	} catch (e) {
		console.log(e);
	}

	return false;
}

export async function handleQuestFinishing(questCompletion, quest) {
	let success = await setStatus(Models.QuestCompletion, questCompletion._id, 'PENDING');
	if (!success) return false;
	let rewards = [];

	console.log(questCompletion.participants);

	for (let i in questCompletion.participants) {
		let participant = questCompletion.participants[i];
		let reward = await pendingQuestCompletionForParticipant(quest, questCompletion, participant);

		rewards.push(...reward);
	}

	console.log(rewards)

	success = await pendingQuestCompletion(quest, questCompletion, rewards);
	if (!success) return false;

	success = await setStatus(Models.QuestCompletion, questCompletion._id, 'SETTLING');
	if (!success) return false;

	success = await settleQuestCompletion(quest, questCompletion, rewards);
	if (!success) return false;

	success = await setStatus(Models.QuestExecution, questCompletion.questExecutionID, 'COMPLETE');
	if (!success) return false;
	success = await setStatus(Models.QuestCompletion, questCompletion._id, 'COMPLETE');
	if (!success) return false;

	return true;
}

export async function revertQuestFinishing(questCompletion, forceRevert = false) {
	try {
		questCompletion = await Models.QuestCompletion.findOneAndUpdate(
			{
				_id: questCompletion._id,
				status: { $nin: getNINStatus(null, 'COMPLETE', null) },
				cancelStatus: { $ne: "CANCELED" },
				revertStatus: { $ne: "REVERTED" },
				timestamp: (
					forceRevert
						? { $exists: true }
						: { $lte: Constants.getTimestamp() - Constants.CANCEL_QUEST_INTERVAL } // not changed for more than 5 min
				)
			}, {
			$set: {
				cancelStatus: "CANCEL_INITIAL",
				timestamp: Constants.getTimestamp()
			}
		}, {
			new: true
		}
		);

		if (!questCompletion) return false;

		let questExecution = await Models.QuestExecution.findById(questCompletion.questExecutionID);

		if (!questExecution) return false;

		let quest = await Models.QuestDefinition.findById(questExecution.questID);

		if (!quest) return false;

		let status = questCompletion.status;

		questCompletion = await setCancelStatus(Models.QuestCompletion, questCompletion._id, "CANCEL_PENDING");

		if (status === "SETTLING") {
			questCompletion = await setRevertStatus(Models.QuestCompletion, questCompletion._id, "REVERT_SETTLING");

			try {
				await revertSettleQuestCompletion(quest, questCompletion, null);
			} catch (e) { }

			status = "PENDING";
		}

		if (status === "PENDING") {
			questCompletion = await setRevertStatus(Models.QuestCompletion, questCompletion._id, "REVERT_PENDING");

			try {
				await revertPendingQuestCompletion(quest, questCompletion, null);
			} catch (e) { }
		}

		questCompletion = await setRevertStatus(Models.QuestCompletion, questCompletion._id, "REVERTED");
		questCompletion = await setCancelStatus(Models.QuestCompletion, questCompletion._id, "CANCELED");

		return questCompletion.cancelStatus === "CANCELED";
	} catch (e) {
		console.log(e);
	}

	return false;
}

export async function pendingQuestCompletionForParticipant(quest, questCompletion, participant) {
	let timestamp = Constants.getTimestamp();
	let rewards = [];

	for (let i in quest.rewards) {
		let rewardDefinition = quest.rewards[i];
		let reward = { participant: participant, type: rewardDefinition.type, amount: undefined };

		if (rewardDefinition.rangeMin && rewardDefinition.rangeMax) {
			let diff = rewardDefinition.rangeMax - rewardDefinition.rangeMin;
			reward.amount = rewardDefinition.rangeMin + Math.ceil(diff * Math.random());
		} else if (rewardDefinition.chance) {
			reward.amount = Math.random() <= rewardDefinition.chance ? 1 : 0;
		}

		if (reward.amount > 0) {
			rewards.push(reward);
		}
	}

	return rewards;
}

export async function pendingQuestCompletion(quest, questCompletion, rewards) {
	if (rewards.length > 0) {
		let status = await Models.QuestExecution.updateOne({
			_id: questCompletion.questExecutionID,
			"pendingRewards.questCompletion": { $ne: questCompletion._id },
		}, {
			$push: {
				pendingRewards: {
					questCompletion: questCompletion._id,
					rewards: rewards
				}
			}
		});

		if (await isQuestExecutionFailed(status, questCompletion)) {
			return false;
		}
	}

	return true;
}

export async function revertPendingQuestCompletion(quest, questCompletion, rewards) {
	let status = await Models.QuestExecution.updateOne({
		_id: questCompletion.questExecutionID,
		"pendingRewards.questCompletion": { $eq: questCompletion._id },
	}, {
		$pull: {
			pendingRewards: {
				questCompletion: questCompletion._id,
				rewards: rewards
			}
		}
	});

	return true;
}

export async function settleQuestCompletion(quest, questCompletion, rewards) {
	let claimableRewards = {};
	for (let i in rewards) {
		let reward = rewards[i];

		if (!claimableRewards[reward.type]) {
			claimableRewards[reward.type] = 0;
		}

		claimableRewards[reward.type] = claimableRewards[reward.type] + reward.amount;
	}
	console.log(claimableRewards)

	let status = await Models.QuestExecution.updateOne({
		_id: questCompletion.questExecutionID,
		"pendingRewards.questCompletion": { $eq: questCompletion._id },
		$or: [
			{ rewards: { $exists: false } },
			{ "rewards.0": { $exists: false } }
		]
	}, {
		rewards: rewards,
		claimableRewards: claimableRewards,
		$pull: {
			pendingRewards: {
				questCompletion: questCompletion._id,
				rewards: rewards
			}
		}
	});

	if (await isQuestExecutionFailed(status, questCompletion)) {
		return false;
	}

	return true;
}

export async function revertSettleQuestCompletion(quest, questCompletion, rewards) {
	let status = await Models.QuestExecution.updateOne({
		_id: questCompletion.questExecutionID,
		"pendingRewards.questCompletion": { $ne: questCompletion._id },
		rewards: rewards
	}, {
		rewards: [],
		claimableRewards: [],
		$push: {
			pendingRewards: {
				questCompletion: questCompletion._id,
				rewards: rewards
			}
		}
	});

	return true;
}

export async function initPendingStaminaForParticipant(questExecution, participant) {
	let status = await Models.Stamina.updateOne({
		_id: participant,
		pending: { $nin: { quest: questExecution._id, stamina: -questExecution.stamina } },
		$expr: {
			$gte: [
				"$stamina",
				questExecution.stamina
			]
		}
	}, {
		$inc: { pendingStamina: -questExecution.stamina },
		$push: { pending: { quest: questExecution._id, stamina: -questExecution.stamina } }
	});

	if (await isQuestExecutionFailed(status, questExecution)) {
		return false;
	}

	console.log('Pending stamina for participant: ', participant, questExecution._id.toString());

	return true;
}

export async function revertPendingStaminaForParticipant(questExecution, participant) {
	console.log('Revert pending stamina for ', participant);
	await Models.Stamina.updateOne({
		_id: participant,
		pending: { $in: { quest: questExecution._id, stamina: -questExecution.stamina } }
	}, {
		$inc: { pendingStamina: questExecution.stamina },
		$pull: { pending: { quest: questExecution._id, stamina: -questExecution.stamina } }
	});

	return true;
}

export async function settleStaminaForParticipant(questExecution, participant) {
	let status = await Models.Stamina.updateOne({
		_id: participant,
		pending: { $in: { quest: questExecution._id, stamina: -questExecution.stamina } },
		$expr: {
			$gte: [
				"$stamina",
				questExecution.stamina
			]
		}
	}, {
		$inc: { stamina: -questExecution.stamina, pendingStamina: questExecution.stamina },
		$pull: { pending: { quest: questExecution._id, stamina: -questExecution.stamina } }
	});

	console.log('Settling stamina for participant: ', participant, questExecution._id.toString());

	return true;
}

export async function revertStaminaForParticipant(questExecution, participant) {
	console.log('Revert stamina for participant: ', participant);

	await Models.Stamina.updateOne({
		_id: participant,
		pending: { $nin: { quest: questExecution._id, stamina: -questExecution.stamina } },
	}, {
		$inc: { stamina: questExecution.stamina, pendingStamina: -questExecution.stamina },
		$push: { pending: { quest: questExecution._id, stamina: -questExecution.stamina } }
	});

	return true;
}

export async function isQuestExecutionFailed(status, questExecution) {
	let failed = (status && status.acknowledged && status.modifiedCount == 0);

	if (failed && getNINStatus(null, 'STARTED', null).indexOf(questExecution.status) === -1) {
		let status = await revertQuestFinishing(questExecution);
		console.log('REVERTED', status);
	}

	return failed;
}

export async function generateStamina(tokenID:Types.ObjectId, cooldownPeriod, cooldownRate, units) {
	let timestamp = Constants.getTimestamp();
	let stamina = await Models.Stamina.findById(tokenID);

	if (!stamina) {
		try {
			let stakeInfo = await Models.StakeInfo.findOne({ tokenID: tokenID, unstakedTimestamp: { $exists: false }, penaltyTimestamp: { $exists: false } });
			stamina = await Models.Stamina.create({ _id: stakeInfo.tokenID, stamina: 0, maxStamina: Constants.BASE_COOLDOWN_CAPACITY, pendingStamina: 0, timestamp: stakeInfo.stakedTimestamp, pending: [] });
		} catch (e) { }
	}

	if (stamina) {
		if (stamina.timestamp < timestamp - Constants.STAMINA_MIN_INTERVAL) {
			let id = Math.floor(Math.random() * 100000000);

			stamina = await Models.Stamina.findOneAndUpdate(
				{
					_id: tokenID,
					timestamp: stamina.timestamp
				}, {
				$push: { pending: { id: id, timestamp: timestamp } }
			}, {
				new: true
			}
			);

			let length = timestamp - stamina.timestamp;
			let currentCooldown = (length / cooldownPeriod) * cooldownRate * units;

			let newStamina = Math.min(stamina.maxStamina || Constants.BASE_COOLDOWN_CAPACITY, Math.floor(currentCooldown) + stamina.stamina);

			if (newStamina > 0) {
				stamina = await Models.Stamina.findOneAndUpdate(
					{
						_id: tokenID,
						timestamp: stamina.timestamp,
						pending: { $in: { id: id, timestamp: timestamp } },
					}, {
					stamina: newStamina,
					timestamp: timestamp,
					pending: []
				}, {
					new: true
				}
				);
			}
		}

		stamina = await Models.Stamina.findById(tokenID);

		return [stamina.stamina, stamina.timestamp, stamina.maxStamina || Constants.BASE_COOLDOWN_CAPACITY];
	} else {
		return [0, 0, Constants.BASE_COOLDOWN_CAPACITY];
	}
}

export async function cancelAllStartingQuests() {
	let questExecutions = [];

	try {
		questExecutions = await Models.QuestExecution.find(
			{
				status: { $nin: getNINStatus(null, 'STARTED', null) },
				cancelStatus: { $ne: "CANCELED" },
				revertStatus: { $ne: "REVERTED" },
				timestamp: { $lte: Constants.getTimestamp() - Constants.CANCEL_QUEST_INTERVAL } // not changed for more than 5 min
			}
		);
	} catch (e) {
		console.log(e);
	}

	console.log('Quest Executions', questExecutions.length)

	for (let i in questExecutions) {
		try {
			await revertQuestStarting(questExecutions[i]);
		} catch (e) {
			console.log(e);
		}
	}

	return true;
}

export async function cancelAllFinishingQuests() {
	let questCompletions = [];

	try {
		questCompletions = await Models.QuestCompletion.find(
			{
				status: { $nin: getNINStatus(null, 'COMPLETE', null) },
				cancelStatus: { $ne: "CANCELED" },
				revertStatus: { $ne: "REVERTED" },
				timestamp: { $lte: Constants.getTimestamp() - Constants.CANCEL_QUEST_INTERVAL } // not changed for more than 5 min
			}
		);
	} catch (e) {
		console.log(e);
	}

	console.log('Quest Completions', questCompletions.length)

	for (let i in questCompletions) {
		try {
			await revertQuestFinishing(questCompletions[i]);
		} catch (e) {
			console.log(e);
		}
	}

	return true;
}

export async function handleClaimAstra(walletJSON, questExecution, rewardType, rewardAmount) {
	let questClaim: HydratedDocument<IQuestClaim>;
	let transaction: HydratedDocument<ITransaction>;

	try {
		transaction = await Transaction.create('REWARD', walletJSON._id, walletJSON._id, rewardAmount, null, null, null);

		questClaim = await createClaim(questExecution._id, rewardType, rewardAmount);

		let success = await setStatus(Models.QuestClaim, questClaim._id, 'PENDING');
		if (!success) throw new Error('Failed claim at step PENDING: ' + questClaim._id);

		success = await Transaction.handleRewardPending(transaction, walletJSON.wallet);
		if (!success) throw new Error('Failed claim at step REWARD_PENDING: ' + questClaim._id);

		success = await pendingClaim(questClaim, questExecution);
		if (!success) throw new Error('Failed claim at step PENDING_CLAIM: ' + questClaim._id);

		success = await setStatus(Models.QuestClaim, questClaim._id, 'SETTLING');
		if (!success) throw new Error('Failed claim at step SETTLING: ' + questClaim._id);

		success = await Transaction.handleRewardSettling(transaction, walletJSON.wallet);
		if (!success) throw new Error('Failed claim at step REWARD_SETTLING: ' + questClaim._id);

		success = await settleClaim(questClaim, questExecution);
		if (!success) throw new Error('Failed claim at step SETTLE_CLAIM: ' + questClaim._id);

		success = await Transaction.setStatus(transaction._id, 'SETTLED');
		if (!success) throw new Error('Failed claim at step SETTLED: ' + questClaim._id);

		success = await setStatus(Models.QuestClaim, questClaim._id, 'COMPLETE');
		if (!success) throw new Error('Failed claim at step COMPLETE: ' + questClaim._id);

		return true;
	} catch (e) {
		console.log(e);

		await revertClaimAstra(questClaim, transaction, true);

		return false;
	}
}

export async function revertClaimAstra(questClaim, transaction = null, forceRevert = false) {
	try {
		questClaim = await Models.QuestClaim.findOneAndUpdate(
			{
				_id: questClaim._id,
				status: { $nin: getNINStatus(null, 'COMPLETE', null) },
				cancelStatus: { $ne: "CANCELED" },
				revertStatus: { $ne: "REVERTED" },
				timestamp: (
					forceRevert
						? { $exists: true }
						: { $lte: Constants.getTimestamp() - Constants.CANCEL_QUEST_INTERVAL } // not changed for more than 5 min
				)
			}, {
			$set: {
				cancelStatus: "CANCEL_INITIAL",
				timestamp: Constants.getTimestamp()
			}
		}, {
			new: true
		}
		);

		if (!questClaim) return false;

		let questExecution = await Models.QuestExecution.findById(questClaim.questExecutionID);

		if (!questExecution) return false;

		let quest = await Models.QuestDefinition.findById(questExecution.questID);

		if (!quest) return false;

		let status = questClaim.status;

		questClaim = await setCancelStatus(Models.QuestClaim, questClaim._id, "CANCEL_PENDING");

		if (status === "SETTLING") {
			questClaim = await setRevertStatus(Models.QuestClaim, questClaim._id, "REVERT_SETTLING");

			try {
				await revertSettleClaim(questClaim, questExecution);
				if (transaction)
					await Transaction.revertAstraSettleDestination(transaction);
			} catch (e) { }
			status = "PENDING";
		}

		if (status === "PENDING") {
			questClaim = await setRevertStatus(Models.QuestClaim, questClaim._id, "REVERT_PENDING");

			try {
				await revertPendingClaim(questClaim, questExecution);
				if (transaction)
					await Transaction.revertAstraAddToDestination(transaction);
			} catch (e) { }
		}

		questClaim = await setRevertStatus(Models.QuestClaim, questClaim._id, "REVERTED");
		questClaim = await setCancelStatus(Models.QuestClaim, questClaim._id, "CANCELED");

		return questClaim.cancelStatus === "CANCELED";
	} catch (e) {
		console.log(e);
	}

	return false;
}

export async function pendingClaim(questClaim, questExecution) {
	let status = await Models.QuestExecution.updateOne({
		_id: questExecution._id,
		pendingClaims: { $nin: { questClaim: questClaim._id, type: questClaim.type, amount: questClaim.amount } }
	}, {
		$push: { pendingClaims: { questClaim: questClaim._id, type: questClaim.type, amount: questClaim.amount } }
	});

	if (await isQuestExecutionFailed(status, questExecution)) {
		return false;
	}

	return true;
}

export async function revertPendingClaim(questClaim, questExecution) {
	let status = await Models.QuestExecution.updateOne({
		_id: questExecution._id,
		pendingClaims: { $in: { questClaim: questClaim._id, type: questClaim.type, amount: questClaim.amount } }
	}, {
		$pull: { pendingClaims: { questClaim: questClaim._id, type: questClaim.type, amount: questClaim.amount } }
	});

	if (await isQuestExecutionFailed(status, questExecution)) {
		return false;
	}

	return true;
}

export async function settleClaim(questClaim, questExecution) {
	let status = await Models.QuestExecution.updateOne({
		_id: questExecution._id,
		pendingClaims: { $in: { questClaim: questClaim._id, type: questClaim.type, amount: questClaim.amount } },
		["claimableRewards." + questClaim.type]: { $gte: questClaim.amount }
	}, {
		$inc: { ["claimableRewards." + questClaim.type]: -questClaim.amount },
		$pull: { pendingClaims: { questClaim: questClaim._id, type: questClaim.type, amount: questClaim.amount } }
	});

	if (await isQuestExecutionFailed(status, questExecution)) {
		return false;
	}

	return true;
}

export async function revertSettleClaim(questClaim, questExecution) {
	let status = await Models.QuestExecution.updateOne({
		_id: questExecution._id,
		pendingClaims: { $nin: { questClaim: questClaim._id, type: questClaim.type, amount: questClaim.amount } }
	}, {
		$inc: { ["claimableRewards." + questClaim.type]: questClaim.amount },
		$push: { pendingClaims: { questClaim: questClaim._id, type: questClaim.type, amount: questClaim.amount } }
	});

	if (await isQuestExecutionFailed(status, questExecution)) {
		return false;
	}

	return true;
}

export async function handleClaimSPL(walletJSON, questExecution, rewardType, rewardAmount) {
	let questClaim: HydratedDocument<IQuestClaim>;
	let transaction: HydratedDocument<ITransaction>;

	try {
		questClaim = await createClaim(questExecution._id, rewardType, rewardAmount);

		let success = await setStatus(Models.QuestClaim, questClaim._id, 'PENDING');
		if (!success) throw new Error('Failed claim at step PENDING: ' + questClaim._id);

		success = await pendingClaim(questClaim, questExecution);
		if (!success) throw new Error('Failed claim at step PENDING_CLAIM: ' + questClaim._id);

		success = await setStatus(Models.QuestClaim, questClaim._id, 'SETTLING');
		if (!success) throw new Error('Failed claim at step SETTLING: ' + questClaim._id);

		success = await sendSPL(rewardType, rewardAmount, walletJSON.wallet);
		if (!success) throw new Error('Failed claim at step CLAIM_REWARD: ' + questClaim._id);

		success = await settleClaim(questClaim, questExecution);
		if (!success) {
			console.log('Failed claim at step SETTLE_CLAIM: ', questClaim._id);
			return false; // DON'T REVERT THE CURRENT TRANSACTION YET - SPL SUCCESSFULLY SENT
		}

		success = await setStatus(Models.QuestClaim, questClaim._id, 'COMPLETE');
		if (!success) {
			console.log('Failed claim at step COMPLETE: ', questClaim._id);
			return false; // DON'T REVERT THE CURRENT TRANSACTION YET - SPL SUCCESSFULLY SENT
		}

		return true;
	} catch (e) {
		console.log(e);

		await revertClaimSPL(questClaim, true);

		return false;
	}
}

export async function sendSPL(rewardType, rewardAmount, destinationWallet) {
	console.log('sending SPL amount: ', rewardAmount);

	try {
		throw 'SPL Sending is not ready yet'
		/*
		const seed = process.env.WALLET_SEED;
		const web3 = require("@solana/web3.js");
		const splToken = require("@solana/spl-token");
		const fromWallet = web3.Keypair.fromSeed(new Uint8Array(seed.slice(0, 32)));
		const toWallet = new web3.PublicKey(destinationWallet);
		const tokenAddress = new web3.PublicKey(process.env['REACT_APP_' + rewardType] || Constants['TEST_' + rewardType]);
		const connection = new web3.Connection(
			process.env.RPC_ENDPOINT,
			'confirmed'
		);

		var token = new splToken.Token(
			connection,
			tokenAddress,
			splToken.TOKEN_PROGRAM_ID,
			fromWallet
		);

		var fromTokenAccount = await token.getOrCreateAssociatedAccountInfo(fromWallet.publicKey);
		var toTokenAccount = await token.getOrCreateAssociatedAccountInfo(toWallet);

		var transaction = new web3.Transaction()
			.add(
				splToken.Token.createTransferInstruction(
					splToken.TOKEN_PROGRAM_ID,
					fromTokenAccount.address,
					toTokenAccount.address,
					fromWallet.publicKey,
					[],
					rewardAmount
				)
			);
		var signature = await web3.sendAndConfirmTransaction(
			connection,
			transaction,
			[fromWallet]
		);

		if (signature) {
			return true;
		}
		*/
	} catch (e) {
		console.log('Sending SPL Reward Failed: ', e)
	}

	return false;
}

export async function revertClaimSPL(questClaim, forceRevert = false) {
	try {
		questClaim = await Models.QuestClaim.findOneAndUpdate(
			{
				_id: questClaim._id,
				status: { $nin: getNINStatus(null, 'COMPLETE', null) },
				cancelStatus: { $ne: "CANCELED" },
				revertStatus: { $ne: "REVERTED" },
				timestamp: (
					forceRevert
						? { $exists: true }
						: { $lte: Constants.getTimestamp() - Constants.CANCEL_QUEST_INTERVAL } // not changed for more than 5 min
				)
			}, {
			$set: {
				cancelStatus: "CANCEL_INITIAL",
				timestamp: Constants.getTimestamp()
			}
		}, {
			new: true
		}
		);

		if (!questClaim) return false;

		let questExecution = await Models.QuestExecution.findById(questClaim.questExecutionID);

		if (!questExecution) return false;

		let quest = await Models.QuestDefinition.findById(questExecution.questID);

		if (!quest) return false;

		let status = questClaim.status;

		questClaim = await setCancelStatus(Models.QuestClaim, questClaim._id, "CANCEL_PENDING");

		if (status === "SETTLING") {
			questClaim = await setRevertStatus(Models.QuestClaim, questClaim._id, "REVERT_SETTLING");

			try {
				await revertSettleClaim(questClaim, questExecution);
			} catch (e) { }
			status = "PENDING";
		}

		if (status === "PENDING") {
			questClaim = await setRevertStatus(Models.QuestClaim, questClaim._id, "REVERT_PENDING");

			try {
				await revertPendingClaim(questClaim, questExecution);
			} catch (e) { }
		}

		questClaim = await setRevertStatus(Models.QuestClaim, questClaim._id, "REVERTED");
		questClaim = await setCancelStatus(Models.QuestClaim, questClaim._id, "CANCELED");

		return questClaim.cancelStatus === "CANCELED";
	} catch (e) {
		console.log(e);
	}

	return false;
}

export async function cancelAllRewardClaims() {
	let questClaims = [];

	try {
		questClaims = await Models.QuestClaim.find(
			{
				status: { $nin: getNINStatus(null, 'COMPLETE', null) },
				cancelStatus: { $ne: "CANCELED" },
				revertStatus: { $ne: "REVERTED" },
				timestamp: { $lte: Constants.getTimestamp() - Constants.CANCEL_QUEST_INTERVAL } // not changed for more than 5 min
			}
		);
	} catch (e) {
		console.log(e);
	}

	console.log('Quest Claims to cancel: ', questClaims.length)

	for (let i in questClaims) {
		try {
			if (questClaims[i].type === "ASTRA") {
				await revertClaimAstra(questClaims[i]);
			} else {
				await revertClaimSPL(questClaims[i]);
			}
		} catch (e) {
			console.log(e);
		}
	}

	return true;
}
