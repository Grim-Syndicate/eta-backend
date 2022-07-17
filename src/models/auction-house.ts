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