import { Schema, Types, model } from 'mongoose';

export interface IQuestExecution {
  walletID: Types.ObjectId
  questID: Types.ObjectId
  participants: Types.ObjectId[]
  status: string
  cancelStatus: string
  revertStatus: string
  timestamp: number
  finishTimestamp: number
  stamina: number
  rewards: IRewards[]
  pendingRewards: IQuestRewards[]
  claimableRewards: any
  pendingClaims: IClaimRewards[]
  questFinish?: number
  participantTokens?: any
}

export interface IRewards {
  participant: Types.ObjectId
  type: string
  amount: number
}

export interface IQuestRewards {
  questCompletion: Types.ObjectId
  rewards: IRewards[]
}

export interface IClaimRewards {
  questClaim: Types.ObjectId
  type: string
  amount: number
}

const rewardsSchema = new Schema<IRewards>({
    participant: {
      type: Schema.Types.ObjectId, 
      ref: 'Token'
    },
    type: String,
    amount: Number
}, {
  _id : false,
  versionKey: false
});

const questRewardsSchema = new Schema<IQuestRewards>({
    questCompletion: {
      type: Schema.Types.ObjectId, 
      ref: 'QuestCompletion'
    },
    rewards: [rewardsSchema]
}, {
  _id : false,
  versionKey: false
});

const claimRewardSchema = new Schema<IClaimRewards>({
    questClaim: {
      type: Schema.Types.ObjectId, 
      ref: 'QuestClaim'
    },
    type: String,
    amount: Number
}, {
  _id : false,
  versionKey: false
});

let questExecutionSchema = new Schema<IQuestExecution>({
  walletID: {
    type: Schema.Types.ObjectId, 
    ref: 'WalletContent',
    index: true
  }, 
  questID: {
    type: Schema.Types.ObjectId, 
    ref: 'QuestDefinition',
    index: true
  },
  participants: [{
    type: Schema.Types.ObjectId, 
    ref: 'Token'
  }],
  status: {
    type: String, /* INITIAL, PENDING, SETTLING, STARTED, COMPLETE, CLAIMED */
    index: true
  },
  cancelStatus: {
    type: String, /* CANCEL_INITIAL, CANCEL_PENDING, CANCELED */
    index: true
  },
  revertStatus: {
    type: String, /* REVERT_INITIAL, REVERT_SETTLING, REVERT_PENDING, REVERTED */
    index: true
  },
  timestamp: {
    type: Number,
    index: true
  },
  finishTimestamp: {
    type: Number
  },
  stamina: Number,
  rewards: [rewardsSchema],
  pendingRewards: [questRewardsSchema],
  claimableRewards: Object,
  pendingClaims: [claimRewardSchema]
}, {versionKey: false});

const QuestExecution = model<IQuestExecution>('QuestExecution', questExecutionSchema);

export default QuestExecution;