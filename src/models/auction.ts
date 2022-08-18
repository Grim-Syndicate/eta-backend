import mongoose from 'mongoose';

let Schema = mongoose.Schema;

const bid = new Schema({
  wallet: String,
  bid: Number,
  timestamp: Number
}, {
  _id: false,
  versionKey: false
});

let astraAuctionSchema = new Schema({
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
  startingBid: Number,
  currentBid: Number,
  currentWinningWallet: {
    type: String,
    index: true
  },
  tickSize: Number, //The increment of each bid. For example if Starting Bid = 1000 and Tick Size = 1000, the bids are forced to be 1000, 2000, 3000, 4000 etc (honestly this is a bad  :D)

  bidHistory: [bid]

}, { versionKey: false });

const AstraAuction = mongoose.model('AstraAuction', astraAuctionSchema);

export default AstraAuction;