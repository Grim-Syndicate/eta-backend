import { Schema, Types, model } from 'mongoose';

let ProposalOption = new Schema({
  _id: Types.ObjectId,
  name: String,
}, {
  versionKey: false
});
ProposalOption.add({
  subOptions: [ProposalOption],
})

let ProposalSchema = new Schema({
  title: String,
  description: String,
  author: String,
  authorLink: String,
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
  quorumRequired: Number,
  supportRequired: Number,
  options: [ProposalOption]
}, {versionKey: false});

const Proposal = model('Proposal', ProposalSchema);

export default Proposal;