import mongoose from 'mongoose';

let Schema = mongoose.Schema;

let paymentSchema = new Schema({
  walletID: {
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'WalletContent',
    index: true
  },
  raffleID: {
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'RaffleCampaign',
    index: true
  },
  entries: Number,
  payment: Number,
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
  }
}, {versionKey: false});

const RafflePayment = mongoose.model('RafflePayment', paymentSchema);

export default RafflePayment;