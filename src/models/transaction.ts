import { Schema, Types, model } from 'mongoose';

export interface ITransaction {
  type: string
  source: Types.ObjectId
  destination: Types.ObjectId
  stakeInfoID: Types.ObjectId
  amount:number
  status: string
  cancelStatus: string
  revertStatus: string
  timestamp: number
  claimTimestamp: number
  hasLockedPoints: boolean
  extraData: any
}

let transactionSchema = new Schema<ITransaction>({
  type: {
    type: String, /* TRANSFER, CLAIM, REWARD */
    index: true
  },
  source: {
    type: Schema.Types.ObjectId, 
    ref: 'WalletContent'
  },
  destination: {
    type: Schema.Types.ObjectId, 
    ref: 'WalletContent'
  },
  stakeInfoID: {
    type: Schema.Types.ObjectId, 
    ref: 'StakeInfo'
  },
  amount: Number,
  status: {
    type: String, /* INITIAL, PENDING, SETTLING, SETTLED */
    index: true
  },
  cancelStatus: {
    type: String, /* CANCEL_INITIAL, CANCEL_PENDING, CANCELED */
    index: true
  },
  revertStatus: {
    type: String, /* REVERT_INITIAL, REVERT_SETTLING, REVERT_PENDING. REVERTED */
    index: true
  },
  timestamp: {
    type: Number,
    index: true
  },
  extraData: {
    type: Object, 
  },
  claimTimestamp: Number,
  hasLockedPoints: Boolean
}, {versionKey: false});

transactionSchema.plugin(require('mongoose-autopopulate'));

const Transaction = model<ITransaction>('Transaction', transactionSchema);

export default Transaction;