import mongoose from 'mongoose';

let Schema = mongoose.Schema;

let raffleCampaignSchema = new Schema({
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
  limit: Number
}, {versionKey: false});

const RaffleCampaign = mongoose.model('RaffleCampaign', raffleCampaignSchema);

export default RaffleCampaign;