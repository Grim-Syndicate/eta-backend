import { Schema, Types, model } from 'mongoose';

export interface IProposalVote {
  wallet: string
  token: string
  proposalID: Types.ObjectId
  proposalOptionID: Types.ObjectId
  inSupport: boolean
  votedOn: number
}

let ProposalVoteSchema = new Schema<IProposalVote>({
  wallet: {
    type: String, 
    index: true
  },
  token: {
    type: String, 
    index: true,
  },
  proposalID: {
    type: Schema.Types.ObjectId, 
    ref: 'Proposal',
    index: true
  },
  proposalOptionID: {
    type: Schema.Types.ObjectId, 
    index: true
  },
  inSupport: Boolean,
  votedOn: Number
}, {  
  versionKey: false,
});
ProposalVoteSchema.index({ proposalOptionID: 1, token: 1 }, { unique: true });

const ProposalVote = model<IProposalVote>('ProposalVote', ProposalVoteSchema);

export default ProposalVote;