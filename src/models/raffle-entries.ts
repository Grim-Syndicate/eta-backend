import mongoose from 'mongoose';

let Schema = mongoose.Schema;

const pendingTicketsSchema = new mongoose.Schema({
    transaction: {
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'RaffleTransaction'
    },
    tickets: String
}, {
  _id : false,
  versionKey: false
});

let raffleEntriesSchema = new Schema({
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
  tickets: {
    type: Number,
    default: 0
  },
  pendingTickets: {
    type: Number,
    default: 0
  },
  pendingTransactions: [pendingTicketsSchema]
}, {versionKey: false});

const RaffleEntries = mongoose.model('RaffleEntries', raffleEntriesSchema);

export default RaffleEntries;