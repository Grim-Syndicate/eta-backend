
export interface CreateItemBody {
    wallet: string;
    message: string;
    form: CreateItemForm;
    blockhash: number;
}

export interface CreateItemForm {
	_id: any;
    item: CreateItem;
}

export interface CreateItem {
	name: string;
    image: string;

}
