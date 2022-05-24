import Functions from '../functions/index';

async function run() {
	try {
		await Functions.Transaction.cancelAllTransferTransactions();
	} catch(e) {
		console.log(e);
	}

	try {
		await Functions.Transaction.cancelAllClaimTransactions();
	} catch(e) {
		console.log(e);
	}

	return {
		success: true
	}
}

export default run;