import mongoose from 'mongoose';
import Token from './token';
import Constants from '../constants';

const Schema = mongoose.Schema;

function newNonce() {
  return Math.floor(Math.random() * 100000000)
}

const pendingTransactionSchema = new mongoose.Schema({
    transaction: {
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'Transaction'
    },
    amount: Number
}, {
  _id : false,
  versionKey: false
});

let walletJSONSchema = {
  wallet: {
    type: String,
    index: true
  },
  nonce: {
    type: Number,
    default: newNonce()
  },
  nonceTimestamp: {
    type: Number,
    default: Constants.getTimestamp()
  },
  firstLogin: Number,
  lastUpdated: Number,
  lastChecked: {
    type: Number,
    index: true
  },
  pointsClaimed: {
    type: Number,
    default: 0
  },
  pointsBalance: {
    type: Number,
    default: 0
  },
  pendingBalance: {
    type: Number,
    default: 0
  },
  isWhitelisted: {
    type: Boolean,
    default: false
  },
  pendingTransactions: [pendingTransactionSchema]
};

let walletSchema = new Schema(walletJSONSchema, {versionKey: false});

walletSchema.methods.isNonceValid = function(token) {
  return this.nonceTimestamp + (20 * 60 * 1000) > Constants.getTimestamp();
};

walletSchema.methods.newNonce = async function() {
  return await WalletModel.findOneAndUpdate({
    _id: this._id
  }, {
    nonce: newNonce(),
    nonceTimestamp: Constants.getTimestamp()
  }, {
    new: true
  });
};

let WalletModel = mongoose.model('Wallet', walletSchema, 'walletcontents');

walletSchema
  .virtual('walletTokens', {
      ref: "Token",
      localField: '_id',
      foreignField: 'walletID',
      justOne: false,
      autopopulate: true
  })


walletSchema.methods.getSimpleToken = function(token) {
  let tokenJSON = null;

  if (this.tokens && this.tokens.length > 0) {
    for (let i in this.tokens) {
      if (this.tokens[i].mint === token) {
        tokenJSON = this.tokens[i];
        break;
      }
    }
  }

  return tokenJSON;
};

walletSchema.methods.getToken = async function(token) {
  return await Token.findOne({walletID: this._id, mint: token}).populate('stakedInfo');
};

walletSchema.plugin(require('mongoose-autopopulate'));

walletSchema.pre('save', function(next) {
  const timestamp = (new Date()).getTime();

  this.lastUpdated = timestamp;
  this.lastChecked = timestamp;

  if (!this.firstLogin) {
    this.firstLogin = timestamp;
  }

  next();
});

walletSchema.set('toObject', { virtuals: true });
walletSchema.set('toJSON', { virtuals: true });

const WalletContent = mongoose.model('WalletContent', walletSchema, 'walletcontents');

export default {
  Wallet: WalletModel,
  WalletContent: WalletContent
}