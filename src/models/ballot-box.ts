import { ObjectId } from "mongoose";

export interface CreateProposalBody {
    wallet: string;
    message: string;
    form: CreateProposalBodyForm;
    blockhash: number;
    id: ObjectId;
}
export interface CreateProposalBodyForm {
    title: string;
    description: string;
    author: string;
    authorLink: string;
    enabledFrom: number;
    enabledTo: number;
}

export interface DeleteProposalBody {
    wallet: string;
    message: string;
    proposalId: string;
    blockhash: number;
    id: ObjectId;
}