import mongoose from 'mongoose';

let Schema = mongoose.Schema;

let questCompletionSchema = new Schema({
  questExecutionID: {
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'QuestExecution',
    index: true
  },
  participants: [{
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Token'
  }],
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

const QuestCompletion = mongoose.model('QuestCompletion', questCompletionSchema);

export default QuestCompletion;