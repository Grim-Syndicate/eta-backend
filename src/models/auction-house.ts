import { ObjectId } from "mongoose";

export interface CreateRaffleBody {
    wallet: string;
    message: string;
    form: CreateRaffleBodyForm;
    blockhash: number;
    id: ObjectId;
}
export interface CreateRaffleBodyForm {
    title: string;
    description: string;
    author: string;
    authorLink: string;
    image: string;
    ticketPrice: number;
    maxTickets: number;
    enabledFrom: number;
    enabledTo: number;
}


export interface UpdateRaffleWinnersBody {
    id: string;
}



export interface CreateAuctionBody {
    wallet: string;
    message: string;
    form: CreateAuctionBodyForm;
    blockhash: number;
    id: ObjectId;
}
export interface CreateAuctionBodyForm {
	currentBid: number;
    title: string;
    description: string;
    author: string;
    authorLink: string;
    image: string;
    startingBid: number;
    enabledFrom: number;
    enabledTo: number;
}


export interface DeleteAuctionBody {
    wallet: string;
    message: string;
    auctionId: string;
    blockhash: number;
    id: ObjectId;
}