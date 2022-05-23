import Functions from '../functions/index';

async function run() {
	try {
		await Functions.Questing.cancelAllStartingQuests();
	} catch(e) {
		console.log(e);
	}

	try {
		await Functions.Questing.cancelAllFinishingQuests();
	} catch(e) {
		console.log(e);
	}

	try {
		await Functions.Questing.cancelAllRewardClaims();
	} catch(e) {
		console.log(e);
	}

	return {
		success: true
	}
}

export default run;