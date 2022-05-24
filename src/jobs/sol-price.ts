import 'dotenv/config'
import Models from '../models/index';
import axios from 'axios';

function getTimestamp() {
	let now = new Date();

	return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours(), now.getUTCMinutes(), now.getUTCSeconds(), now.getUTCMilliseconds());
}

async function run() {
	let timestampStart = getTimestamp();
	let success = true;
	let solPrice = {};

	try {

		let res = await axios.get(`https://min-api.cryptocompare.com/data/price?fsym=SOL&tsyms=USD&api_key=${process.env.CRYPTOCOMPARE_KEY}`);

		if (res.status == 200) {
			try {
				solPrice = res.data;
				await Models.JSONConfigs.findOneAndUpdate({
					name: "sol-price",
				}, {
					config: solPrice
				}, {
					upsert: true
				});
			} catch (e) {
				console.log(e);
			}
		}
	} catch(err) {
		console.log(err);
		success = false;
	}

	return {
		success: success,
		solPrice: solPrice,
		time: (getTimestamp() - timestampStart) / 1000
	}
}

export default run;