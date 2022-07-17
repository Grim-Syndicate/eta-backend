import Models from './../models/index';
import Constants from './../constants';
import Functions from './../functions/index';
import { CreateRaffleBody, UpdateRaffleWinnersBody } from 'models/auction-house';
import axios from 'axios';

const ObjectId = require('mongoose').Types.ObjectId;

function shuffleArray(array) {
	for (let i = array.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[array[i], array[j]] = [array[j], array[i]];
	}
}

async function getRaffleEntries(raffleID) {
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

export async function getRaffleWinners(raffleID, winnersCount = 1, uniqueWinners = true): Promise<{error: string, winners: Array<string>}> {
	let entries = await getRaffleEntries(raffleID)

	if (entries.length === 0) {
		return {
			error: "This raffle has no entries!",
			winners: []
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
		winners: winners
	}
	/*
	fs.writeFileSync(
		`./raffle-entries/winners_${raffleID}.json`,
		JSON.stringify(winners, null, 1)
	);*/
}