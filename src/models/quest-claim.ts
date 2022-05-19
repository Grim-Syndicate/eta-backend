import { Schema, Types, model } from 'mongoose';

export interface IQuestClaim {
  questExecutionID: Types.ObjectId
  transactionID: Types.ObjectId
  type: string
  amount: number
  status: string
  cancelStatus: string
  revertStatus: string
  timestamp: number
}

let questClaimSchema = new Schema<IQuestClaim>({
  questExecutionID: {
    type: Schema.Types.ObjectId, 
    ref: 'QuestExecution',
    index: true
  },
  transactionID: {
    type: Schema.Types.ObjectId, 
    ref: 'Transaction',
    index: false
  },
  type: {
    type: String, /* ASTRA, VOIDMATTER_VIAL, etc */
    index: false
  },
  amount: {
    type: Number,
    index: false
  },
  status: {
    type: String, /* INITIAL, PENDING, SETTLING, COMPLETE */
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
  }
}, {versionKey: false});

const QuestClaim = model<IQuestClaim>('QuestClaim', questClaimSchema);

export default QuestClaim;