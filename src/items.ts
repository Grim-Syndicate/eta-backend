import { HydratedDocument, Types } from 'mongoose'
import Models from './models/index';
import Constants from './constants';
import Functions from './functions/index';
import { CreateItemBody } from 'models/items';
const ObjectId = require('mongoose').Types.ObjectId;

function isValidObjectId(id){
    if(Types.ObjectId.isValid(id)){
        if((String)(new Types.ObjectId(id)) === id)
            return true;
        return false;
    }
    return false;
}

export async function createItem(body: CreateItemBody) {
	console.log("body", body);
	if (!body.wallet || !body.message) {
		return {
			success: false,
			error: 'Invalid wallet or message'
		}
	}

	const blockhash = body.blockhash;
	const message = body.message;

	let messageResult = false;
	let action = 'create-item';
	let data = {
		form: body.form,
		wallet: body.wallet,
	};

	let walletJSON = await Functions.getWalletJSON(body.wallet);
	if (!walletJSON.roles.includes("QUEST_EDITOR")) {
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


	if (!body.form._id) {
		console.log("generating new id");
		body.form._id = ObjectId();
	}
	try {
		await Models.ItemDefinition.findOneAndUpdate({ _id: body.form._id }, body.form, { upsert: true });
	} catch (e) {
		console.log(e);

		return {
			success: false,
			error: 'Creating Item Failed'
		};
	}

	return {
		success: true,
		id: body.form._id
	}
}

export async function getAllItems() {
	const timestamp = Constants.getTimestamp();

	let items = await Models.ItemDefinition.find();

	return {
		success: true,
		items: items
	}
}

export async function getItemById(itemID) {
	if (isValidObjectId(itemID) === false){
		return {
			success: false,
			error: 'Invalid Request'
		}
	}

	let item = await Models.ItemDefinition.findById(itemID);

	return {
		success: true,
		quest: item
	}
}