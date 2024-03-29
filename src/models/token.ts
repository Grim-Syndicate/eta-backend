import { Schema, Types, model, HydratedDocument } from 'mongoose';
import Constants from '../constants';
import StakeInfo, { IStakeInfo } from './stake-info';

export interface IToken {
  _id: Types.ObjectId
  walletID: Types.ObjectId
  mint:string
  inWallet:number
  isStaked:boolean

  getLaststakedInfo: () => Promise<HydratedDocument<IStakeInfo>>
}

const rewardsSchema = new Schema({
    type: String,
    amount: Number
}, {
  _id : false,
  versionKey: false
});

let tokenSchema = new Schema<IToken>({
  walletID: {
    type: Schema.Types.ObjectId, 
    ref: 'WalletContent',
    index: true
  },
  mint: {
    type: String,
    index: true
  },
  inWallet: Number,
  isStaked: {
    type: Boolean,
    default: false,
    index: true
  }
}, {versionKey: false});

tokenSchema
  .virtual('stakedInfo', {
      ref: "StakeInfo",
      localField: '_id',
      foreignField: 'tokenID',
      justOne: false
  })

// TODO create virtual for last staked info

tokenSchema.plugin(require('mongoose-autopopulate'));

tokenSchema.methods.isStakedStatus = async function() {
  let staked = await this.getLaststakedInfo();

  return staked && !staked.unstakedTimestamp && !staked.penaltyTimestamp;
};

tokenSchema.methods.getStakedTimestamp = async function() {
  let staked = await this.getLaststakedInfo();

  return staked ? staked.stakedTimestamp : null;
};

tokenSchema.methods.getUnstakedTimestamp = async function() {
  let staked = await this.getLaststakedInfo();

  return staked ? staked.unstakedTimestamp : null;
};

tokenSchema.methods.getClaimedTimestamp = async function() {
  let staked = await this.getLaststakedInfo();

  return staked ? staked.claimedTimestamp : null;
};

tokenSchema.methods.getPenaltyTimestamp = async function() {
  let staked = await this.getLaststakedInfo();

  return staked ? staked.penaltyTimestamp : null;
};

tokenSchema.methods.hasPenalty = async function() {
    let timestamp = Constants.getTimestamp(); 
    let penaltyTimestamp = this.penaltyTimestamp;

    if (!penaltyTimestamp) {
      let staked = await this.getLaststakedInfo();

      if (staked) {
        penaltyTimestamp = staked.penaltyTimestamp;
      }
    }

    return penaltyTimestamp > 0 && (timestamp - penaltyTimestamp) < Constants.PENALTY_LENGTH * Constants.ONE_PENALTY_PERIOD;
};

tokenSchema.methods.getLaststakedInfo = async function() {
  if (!this.lastStaked) {
    this.lastStaked = await StakeInfo.findOne({tokenID: this._id}).sort({ stakedTimestamp: -1});
  }

  return this.lastStaked;
};

tokenSchema.methods.handleWalletState = async function(inWallet:number) {
  if (this.inWallet === Constants.IN_WALLET && inWallet !== Constants.IN_WALLET) {
    let timestamp = new Date().getTime();
    let staked = await this.getLaststakedInfo();

    if (!staked.penaltyTimestamp && !staked.unstakedTimestamp) {
      staked.penaltyTimestamp = timestamp;
      staked.save();
    }
  }

  if (this.inWallet !== inWallet) {
    await model('Token', tokenSchema).findByIdAndUpdate(this._id, {
      inWallet: inWallet
    })
  }

  return await model('Token', tokenSchema).findById(this._id).populate('stakedInfo');
};

tokenSchema.set('toObject', { virtuals: true });
tokenSchema.set('toJSON', { virtuals: true });

const Token = model<IToken>('Token', tokenSchema);

export default Token;