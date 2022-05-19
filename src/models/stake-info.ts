import mongoose from 'mongoose';

let Schema = mongoose.Schema;

const pendingTransactionSchema = new mongoose.Schema({
    transaction: {
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'Transaction'
    },
    timestamp: Number
}, {
  _id : false,
  versionKey: false
});

let stakeInfoSchema = new Schema({
  tokenID: {
    type: mongoose.Schema.Types.ObjectId, 
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

const StakeInfo = mongoose.model('StakeInfo', stakeInfoSchema);

export default StakeInfo;