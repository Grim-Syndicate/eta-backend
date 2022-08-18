import { Schema, Types, model, HydratedDocument } from 'mongoose';
import Token, { IToken } from './token';
import Constants from '../constants';

export interface IWallet {
  _id: Types.ObjectId
  wallet:string
  nonce:number
  nonceTimestamp:number
  pointsClaimed:number
  pointsBalance:number
  pendingBalance:number
  isWhitelisted:boolean
  //pendingTransactions
  lastUpdated: number
  lastChecked: number
  firstLogin: number
  walletTokens?: any[]
  roles: Array<string>

  getToken: (token:string) => Promise<HydratedDocument<IToken>>
}

function newNonce() {
  return Math.floor(Math.random() * 100000000)
}

const pendingTransactionSchema = new Schema({
    transaction: {
      type: Schema.Types.ObjectId, 
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
    unique: true,
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
  roles: {
    type: [String],
    default: []
  },
  pendingTransactions: [pendingTransactionSchema]
};

let walletSchema = new Schema<IWallet>(walletJSONSchema, {versionKey: false});

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

let WalletModel = model<IWallet>('Wallet', walletSchema, 'walletcontents');

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

walletSchema.methods.getToken = async function(token:string) {
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

const WalletContent = model('WalletContent', walletSchema, 'walletcontents');

export default {
  Wallet: WalletModel,
  WalletContent: WalletContent
}