import { Schema, Types, model } from 'mongoose';

export interface IStakeInfo {
  _id: Types.ObjectId
  tokenID: Types.ObjectId
  stakedTimestamp:number
  unstakedTimestamp:number
  claimedTimestamp:number
  penaltyTimestamp:number
  hasClaimablePoints:boolean
  lastUpdated:boolean
  pendingTransactions:IPendingTransaction[]
}

export interface IPendingTransaction {
  _id: Types.ObjectId
  transaction: Types.ObjectId
  timestamp:number
}

const pendingTransactionSchema = new Schema({
    transaction: {
      type: Schema.Types.ObjectId, 
      ref: 'Transaction'
    },
    timestamp: Number
}, {
  _id : false,
  versionKey: false
});

let stakeInfoSchema = new Schema<IStakeInfo>({
  tokenID: {
    type: Schema.Types.ObjectId, 
    ref: 'Token',
    index: true
  },
  stakedTimestamp: {
    type: Number,
    index: true
  },
  unstakedTimestamp: Number,
  claimedTimestamp: Number,
  penaltyTimestamp: Number,
  hasClaimablePoints: {
    type: Boolean,
    default: true
  },
  lastUpdated: Number,
  pendingTransactions: [pendingTransactionSchema]
}, {versionKey: false});

stakeInfoSchema.plugin(require('mongoose-autopopulate'));

const StakeInfo = model<IStakeInfo>('StakeInfo', stakeInfoSchema);

export default StakeInfo;