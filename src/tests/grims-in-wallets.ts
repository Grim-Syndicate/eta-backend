import 'dotenv/config'
import mongoose from '../mongodb-client';
import run from '../jobs/grims-in-wallets';

async function loadTestGrimsInwallets() {
    mongoose
	for (let i = 0; i < 1; i++) {
		let promises = [];

		for (let n = 0; n < 1; n++) {
			console.log(i);
			let res = run(10);
			promises.push(res);
		}

		await Promise.all(promises);
	}
}

loadTestGrimsInwallets();