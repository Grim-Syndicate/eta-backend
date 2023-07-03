import { Schema, Types, model } from 'mongoose';

export interface IRaffleCampaign {
  _id: Types.ObjectId
  title: string
  shortDescription: string
  author: string
  authorLink: string
  image: string
  enabled: boolean
  enabledFrom: number
  enabledTo: number
  ticketPrice: number
  maxTickets: number
  limit: number
  uniqueWinners: boolean
  winnerCount: number
  winners: string[]
  walletTickets?: number
  totalTickets?: number
  ended?:boolean
  beneficiary?:string
  beneficiaryPaymentID?:Types.ObjectId
}

let raffleCampaignSchema = new Schema<IRaffleCampaign>({
  title: String,
  shortDescription: String,
  author: String,
  authorLink: String,
  image: String,
  enabled: {
    type: Boolean,
    default: false,
    index: true
  },
  enabledFrom: {
    type: Number,
    index: true
  },
  enabledTo: {
    type: Number,
    index: true
  },
  ticketPrice: Number,
  maxTickets: Number,
  limit: Number,
  uniqueWinners: Boolean,
  winnerCount: Number,
  winners:[String],
  beneficiary: String,
  beneficiaryPaymentID: Types.ObjectId,
}, {versionKey: false});

const RaffleCampaign = model<IRaffleCampaign>('RaffleCampaign', raffleCampaignSchema);

export default RaffleCampaign;