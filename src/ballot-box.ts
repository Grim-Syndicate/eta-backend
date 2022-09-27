import { isNftWithToken, Metaplex, Nft } from "@metaplex-foundation/js";
import { Connection, PublicKey } from "@solana/web3.js";
import Models from './models/index';
import Constants from './constants';
import Functions from './functions/index';
import { CreateProposalBody } from 'models/ballot-box';
import ProposalVote, { IProposalVote } from "models/proposal-vote";
import mongoose from './mongodb-client';
import { ClientSession, Types } from "mongoose";
const ObjectId = require('mongoose').Types.ObjectId;

export async function createProposal(body: CreateProposalBody) {
	if (!body.wallet || !body.message) {
		return {
			success: false,
			error: 'Invalid wallet or message'
		}
	}
	
	let requiredVariables = [
		"title",
		"author",
		"description",
		"enabledFrom",
		"enabledTo"
	];
	for (let required of requiredVariables) {
		if (!body.form[required]) {
			return {
				success: false,
				error: `Missing ${required}`,
			}
		}
	}
	if (!body.form.title || !body.form.author || !body.form.description || !body.form.enabledFrom || !body.form.enabledTo ) {
		return {
			success: false,
			error: 'Invalid Request'
		}
	}

	const blockhash = body.blockhash;
	const message = body.message;

	let messageResult = false;
	let action = 'create-edit-proposal';
	let data = {
		form: body.form,
		wallet: body.wallet,
	};

	let walletJSON = await Functions.getWalletJSON(body.wallet);
	if (!walletJSON.roles.includes("PROPOSAL_CREATOR")) {
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
		body.id = ObjectId();
	}
	try {
		await Models.Proposal.findOneAndUpdate({ _id: body.id}, body.form, { upsert: true });
	} catch (e) {
		console.log(e);

		return {
			success: false,
			error: 'Creating Proposal Failed'
		};
	}

	return {
		success: true,
		id: body.id
	}
}

export async function getActiveProposals(walletID) {
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

		let proposals = await Models.Proposal.find({
			enabled: true,
			$and:[
				{$or: [{enabledFrom: {$exists: false}}, {enabledFrom: {$lte: timestamp}}]},
			]
		}).sort({'title': 1});

		if (wallet.roles && wallet.roles.includes("PROPOSAL_CREATOR")) {
			let proposalsNotEnabled = await Models.Proposal.find({
				$and: [
					{ enabled: false },
				],
			}).sort({'title': 1});

			let proposalsIds = proposals.map(a => a._id);
			let notInProposals = proposalsNotEnabled.filter(a => !proposalsIds.includes(a._id));
			proposals = proposals.concat(notInProposals);
		}

		let results = [];

		for (let i in proposals) {
			let entries = proposals[i].toJSON();
			//let walletEntries = await Models.RaffleEntries.findOne({walletID: wallet._id, raffleID: raffles[i]._id});
			//let totalEntries = await Models.RaffleEntries.find({raffleID: raffles[i]._id});
			//let totalTickets = 0;
			//for (let i in totalEntries) {
			//	totalTickets += totalEntries[i].tickets;
			//}
			//entries.walletTickets = walletEntries?.tickets;
			//entries.totalTickets = totalTickets;

			results.push(entries);
		} 
		results.sort((a, b) => {
			return a.title?.localeCompare(b.title);
	
		})
		return {
			success: true,
			proposals: results,
		}
	} catch {
		return {
			success: false,
			error: 'Access Denied'
		};
	}
}

export async function getWalletVotes(walletID, proposalID) {
	if (!walletID || !proposalID) {
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

		let existingVotes = await Models.ProposalVote.aggregate([
			{ $match: {
				wallet: walletID,
				proposalID: ObjectId(proposalID)
			}},
			// Grouping pipeline
			{ $group: {
				_id: "$proposalOptionID",
				doc: {$first: "$$ROOT"}
			}},
		])
		
		let results:{[key:string]:boolean} = {};
		let votedOn:number
		for (let vote of existingVotes) {
			results[vote.doc.proposalOptionID] = vote.doc.inSupport
			votedOn = vote.doc.votedOn
		} 

		//let existingVotes = await Models.ProposalVote.distinct('proposalOptionID', {
		//	wallet: walletID,
		//	proposalID: proposalID
		//});

		return {
			success: true,
			votes: results,
			votedOn: votedOn,
		}
	} catch (e){
		console.log(e)
		return {
			success: false,
			error: 'Error getting wallet votes'
		};
	}
}

export async function getResults(proposalID) {
	if (!proposalID) {
		return {
			success: false,
			error: 'Invalid Request'
		}
	}

	try {
		let resultsRaw = await Models.ProposalVote.aggregate(
			[{ 
				$match: { 
					proposalID: ObjectId(proposalID),
					proposalOptionID: { $ne:null }
				}
			},
			// Count all occurrences
			{ 
				$group: {
					  _id: {
							proposalOptionID: "$proposalOptionID",
							inSupport: "$inSupport"
					  },
					  count: { $sum: 1 }
				}
			}])
		
		let results:{[key:string]:any} = {};

		for (let result of resultsRaw) {
			if(!results[result._id.proposalOptionID]){
				results[result._id.proposalOptionID] = {}
			}
			if(result._id.inSupport === true){
				results[result._id.proposalOptionID]['inSupport'] = result.count
			} else {
				results[result._id.proposalOptionID]['against'] = result.count
			}
		} 

		return {
			success: true,
			results: results,
		}
	} catch (e){
		console.log(e)
		return {
			success: false,
			error: 'Error getting wallet votes'
		};
	}
}

export async function submitVote(wallet: string, proposalID: string, votes: any[], voteWeight:number, message, blockhash) {
	if (!wallet || !proposalID || !votes || !voteWeight || !message ) {
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

	let proposal = await Models.Proposal.findById(proposalID);

	if (!proposal) {
		console.log('Proposal not found!');
		return {
			success: false,
			error: 'Invalid Request'
		}
	}
	const date = new Date();
	const now = Math.floor(date.getTime());// / 1000);
	if (now < proposal.enabledFrom) {
		return {
			success: false,
			error: `This proposal hasn't started yet`,
		}
	}
	if (now > proposal.enabledTo) {
		return {
			success: false,
			error: `This proposal has already ended`,
		}
	}

	let messageResult = false;
	const action = 'submit-vote';
	const data = {
		proposalID: proposalID,
		votes: votes,
		voteWeight: voteWeight,
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

	//Check if server sees as many grims as front-end
	const connection = new Connection(process.env.RPC_ENDPOINT)
	const metaplex = new Metaplex(connection)
	const walletNfts = await metaplex
    .nfts()
    .findAllByOwner({ owner: new PublicKey(wallet) })
    .run();

	let grims:Nft[] = []

	for(const nft of walletNfts){
		if(nft.symbol == 'GRIM' && 
			nft.creators.at(1)?.address.toBase58() == 'Es1YghGkHZNJ8A9r6oFEHbWsRHbqs4rz6gfkRJ9V4bYf'
		){
			grims.push(nft as Nft)
		}
	}

	if(voteWeight != grims.length){
		console.log(`Vote weight check. Client sent ${voteWeight} and server saw ${grims.length} for ${wallet}`);
		return {
			success: false,
			error: `Vote weight doesn't match`
		}	
	}

	//Save votes

	const timestamp = Constants.getTimestamp();

	let proposalVotes = [];
	let grimTokens = [];
	let proposalOptionIDs:Set<String> = new Set();

	for (let grim of grims){
		for (let proposalOptionID in votes) {
			let inSupport = votes[proposalOptionID]
			let proposalVote:IProposalVote = {
				proposalOptionID: ObjectId(proposalOptionID),
				inSupport: inSupport,
				proposalID: proposal._id,
				votedOn: timestamp,
				wallet: wallet,
				token: grim.address.toBase58(),
			}
			proposalVotes.push(proposalVote)
			proposalOptionIDs.add(proposalOptionID)
		}
		grimTokens.push(grim.address.toBase58())
	}

	const proposalOptionIDsArray = Array.from(proposalOptionIDs)

	let existingVotes = await Models.ProposalVote.find({
		proposalOptionID: { $in: proposalOptionIDsArray },
		token: { $in: grimTokens }
	})

	if(existingVotes && existingVotes.length > 0){
		//already voted. Make sure the owner is the same and update
		const mongoClient = await mongoose;
		const session: ClientSession = await mongoClient.startSession();
		try{
			const transactionResults = await session.withTransaction(async () => {
				let updates = []
				for(const existingVote of existingVotes){
					if(existingVote.wallet != wallet){
						await session.abortTransaction();
						await session.endSession();
						console.log("The transaction was aborted because of a previous vote");
						return {
							success: false,
							error: 'One of your grims has already voted on a different wallet.'
						};
					}
					updates.push({
						updateOne: {
							filter: {
								_id: existingVote._id
							},
							update: {
								$set: {
									votedOn: timestamp,
									inSupport: votes[existingVote.proposalOptionID.toString()]				
								}
							}
						}
					})
				}
				await Models.ProposalVote.bulkWrite(updates, { session })
			})

			if (transactionResults === undefined) {
				console.log("Something went wrong creating a new bid");
				return {
					success: false,
					error: "Something went wrong updating your vote, try again",
				}
			}
		} catch (e) {
			console.log("The transaction was aborted due to an unexpected error: ", e);
		} finally {
			await session.endSession();
		}

		//Everything was okay!

		return {
			success: true,
		};
	} else {
		//new vote
		try {
			const response = await Models.ProposalVote.create(proposalVotes)
			if (!response) throw new Error('Failed to cast vote');
			return {
				success: true
			}
		} catch (e) {
			console.log(e);
			return {
				success: false,
				error: 'Casting vote failed'
			};
		}
	}
}