import { HydratedDocument, Types } from 'mongoose'
import Models from './models/index';
import Constants from './constants';
import Functions from './functions/index';
import { IQuestExecution } from './models/quest-execution';

function isValidObjectId(id){
    if(Types.ObjectId.isValid(id)){
        if((String)(new Types.ObjectId(id)) === id)
            return true;
        return false;
    }
    return false;
}

export async function getAvailableQuests() {
	const timestamp = Constants.getTimestamp();

	let quests = await Models.QuestDefinition.find({
		enabled: true,
		$and:[
			{$or: [{enabledFrom: {$exists: false}}, {enabledFrom: {$lte: timestamp}}]},
			{$or: [{enabledTo: {$exists: false}}, {enabledTo: {$gte: timestamp}}]}
		]
	})

	return {
		success: true,
		quests: quests
	}
}

export async function getQuest(questID) {
	if (isValidObjectId(questID) === false){
		return {
			success: false,
			error: 'Invalid Request'
		}
	}

	let quest = await Models.QuestDefinition.findById(questID);

	return {
		success: true,
		quest: quest
	}
}

export async function getStartedQuests(wallet, questID) {
	if (!wallet || isValidObjectId(questID) === false) {
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

	let quest = await Models.QuestDefinition.findById(questID);

	if (!quest) {
		console.log('Quest not found!');
		return {
			success: false,
			error: 'Invalid Request'
		}
	}

	let results = [];

	let quests = await Models.QuestExecution.find({
		walletID: walletJSON._id, 
		questID: questID, 
		cancelStatus: {$exists: false},
		revertStatus: {$exists: false},
		$or:[{
			status: 'STARTED',
		},
		{
			status: 'COMPLETE', //NEED IT TO BE ABLE TO SHOW CLAIM SCREEN
		}]
	});

	for (let i in quests) {
		let activeQuest = quests[i].toJSON();
		activeQuest.questFinish = activeQuest.finishTimestamp;
		activeQuest.participantTokens = await Models.Token.find({_id: {$in: quests[i].participants}});

		results.push(activeQuest);
	}

	return {
		success: true,
		quests: results
	}
}

export async function startQuest(wallet, questID, participants, message, blockhash) {
	if (!wallet || !questID || !participants || participants.length === 0 || !message) {
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

	let quest = await Models.QuestDefinition.findById(questID);

	if (!quest) {
		console.log('Quest not found!');
		return {
			success: false,
			error: 'Invalid Request'
		}
	}

	let messageResult = false;
	let action = 'start-quest';
	let data = {
		participants: participants,
		wallet: wallet,
		quest: questID
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

	let tokensInWallet = await Functions.getTokensInWallet(wallet);
	let grimTokens = await Functions.getGrimsFromTokens(wallet, tokensInWallet);
	let daemonsMetadata = Functions.getAllDaemonsMetadata(tokensInWallet);

	let walletCooldownRate = 1 + (Math.min(Constants.COOLDOWN_DAEMONS_MAX, daemonsMetadata.length) * Constants.COOLDOWN_DAEMON_IMPACT_RATE) / 100;
	let participantTokens = [];

	for (let i in participants) {
		if (grimTokens[participants[i]] && grimTokens[participants[i]] === Constants.IN_WALLET) {
			let token = await Models.Token.findOne({walletID: walletJSON._id, mint: participants[i]});
			participantTokens.push(token._id);

			await Functions.Questing.generateStamina(token._id, Constants.ONE_COOLDOWN_PERIOD, walletCooldownRate, Constants.COOLDOWN_UNITS);
		}
	}

	let questExecution: HydratedDocument<IQuestExecution>;
	let result = {
		success: true,
        quest:null,
        questFinish:null,
        participantTokens:null,
	};

	try {
		questExecution = await Functions.Questing.createStart(walletJSON._id, questID, participantTokens, quest.stamina, quest.duration);
		let success = await Functions.Questing.handleQuestStarting(questExecution);
		if (!success) throw new Error('Failed quest starting: ' + questExecution._id);

		questExecution = await Models.QuestExecution.findById(questExecution._id);
		result.quest = questExecution;
		result.questFinish = result.quest.finishTimestamp;
		result.participantTokens = await Models.Token.find({_id: {$in: questExecution.participants}});
	} catch (e) {
		console.log(e);

		await Functions.Questing.revertQuestStarting(questExecution, true);

		return {
			success: false,
			error: 'Quest Starting Failed'
		};
	}

	return result;
}

export async function finishQuest(wallet, questID, message, blockhash) {
	if (!wallet || !questID || !message) {
		return {
			success: false,
			error: 'Invalid Request'
		}
	}

	let timestamp = Constants.getTimestamp();
	let walletJSON = await Functions.getWalletJSON(wallet);

	if (!process.env.WHITELIST_DISABLED && !walletJSON.isWhitelisted) {
		console.log('Access Denied');
		return {
			success: false,
			error: 'Access Denied'
		};
	}

	let questExecution = await Models.QuestExecution.findById(questID);
	if(!questExecution){
		console.log('Quest ID not found!');
		return {
			success: false,
			error: 'Invalid Quest ID'
		}
	}

	let quest = await Models.QuestDefinition.findById(questExecution.questID);

	if (!quest || !questExecution || questExecution.status != "STARTED") {
		console.log('Quest not found!');
		return {
			success: false,
			error: 'Invalid Quest'
		}
	}

	if (questExecution.status == "STARTED" && timestamp < questExecution.timestamp + quest.duration) {
		console.log('Quest ' + questExecution._id + ' is still in progress');
		return {
			success: false,
			error: 'Quest still in progress'
		}
	}

	let messageResult = false;
	let action = 'finish-quest';
	let data = {
		wallet: wallet,
		quest: questID
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

	let tokensInWallet = await Functions.getTokensInWallet(wallet);
	let grimTokens = await Functions.getGrimsFromTokens(wallet, tokensInWallet);
	
	let participants = questExecution.participants;
	let participantTokens = [];

	for (let i in participants) {
		let token = await Models.Token.findById(participants[i]);

		if (grimTokens[token.mint] && grimTokens[token.mint] === Constants.IN_WALLET) {
			participantTokens.push(token._id);
		}
	}

	let questCompletion = {};
	let result = {
		success: true,
        quest:null,
        participantTokens:null,

	};

	try {
		questCompletion = await Functions.Questing.createFinish(questExecution._id, participantTokens);
		let success = await Functions.Questing.handleQuestFinishing(questCompletion, quest);
		if (!success) throw new Error('Failed quest finishing: ' + quest._id);

		questExecution = await Models.QuestExecution.findById(questExecution._id);
		result.quest = questExecution;
		result.participantTokens = await Models.Token.find({_id: {$in: questExecution.participants}});
	} catch (e) {
		console.log(e);

		await Functions.Questing.revertQuestFinishing(questCompletion, true);

		return {
			success: false,
			error: 'Quest Finish Failed'
		};
	}

	return result;
}

export async function claimRewards(wallet, questID, message, blockhash) {
	if (!wallet || !questID || !message) {
		return {
			success: false,
			error: 'Invalid Request'
		}
	}

	let timestamp = Constants.getTimestamp();
	let walletJSON = await Functions.getWalletJSON(wallet);

	if (!process.env.WHITELIST_DISABLED && !walletJSON.isWhitelisted) {
		console.log('Access Denied');
		return {
			success: false,
			error: 'Access Denied'
		};
	}

	let questExecution = await Models.QuestExecution.findById(questID);
	let quest = await Models.QuestDefinition.findById(questExecution.questID);

	if (!quest || !questExecution || questExecution.status != "COMPLETE") {
		console.log('Quest not found!');
		return {
			success: false,
			error: 'Invalid Quest'
		}
	}

	let messageResult = false;
	let action = 'claim-rewards';
	let data = {
		wallet: wallet,
		quest: questID
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

	let result = {
		success: true,
        quest:null,
        participantTokens:null,
	};

	try {
		for (let rewardType in questExecution.claimableRewards) {
			let rewardAmount = questExecution.claimableRewards[rewardType];

			if (rewardAmount > 0) {
				if (rewardType == "ASTRA") {
					let success = await Functions.Questing.handleClaimAstra(walletJSON, questExecution, rewardType, rewardAmount);
					if (!success) throw new Error('Failed claiming astra');
				} else {
					let success = await Functions.Questing.handleClaimSPL(walletJSON, questExecution, rewardType, rewardAmount);
					if (!success) throw new Error('Failed claiming SPL');
				}
			}
		}

		let success = await Functions.Questing.setStatus(Models.QuestExecution, questExecution._id, 'CLAIMED');
		if (!success) return false;

		questExecution = await Models.QuestExecution.findById(questExecution._id);
		result.quest = questExecution;
		result.participantTokens = await Models.Token.find({_id: {$in: questExecution.participants}});
	} catch(e) {
		console.log(e);

		return {
			success: false,
			error: 'Rewards Claiming Failed'
		};
	}

	return result;
}
