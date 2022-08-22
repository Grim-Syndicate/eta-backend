import { Schema, Types, model } from 'mongoose';
import { IRaffleCampaign } from './raffle-campaign';

export interface IRaffleEntry {
  _id: Types.ObjectId
  walletID: Types.ObjectId
  raffleID: Types.ObjectId
  tickets: number
  pendingTickets: number
  pendingTransactions: IPendingTicket[]
  entryDate?:number
  totalCost?: number
  raffle?:IRaffleCampaign
}

export interface IPendingTicket {
  transaction: Types.ObjectId
  tickets: string
}

const pendingTicketsSchema = new Schema<IPendingTicket>({
    transaction: {
      type: Schema.Types.ObjectId, 
      ref: 'RaffleTransaction'
    },
    tickets: String
}, {
  _id : false,
  versionKey: false
});

let raffleEntriesSchema = new Schema<IRaffleEntry>({
  walletID: {
    type: Schema.Types.ObjectId, 
    ref: 'WalletContent',
    index: true
  },
  raffleID: {
    type: Schema.Types.ObjectId, 
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

const RaffleEntries = model<IRaffleEntry>('RaffleEntries', raffleEntriesSchema);

export default RaffleEntries;