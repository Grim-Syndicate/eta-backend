
export interface UpdateQuestBody {
    wallet: string;
    message: string;
    form: UpdateQuestForm;
    blockhash: number;
}

export interface UpdateQuestForm {
	_id: any;
    name: string;
    questScript: Array<UpdateQuestFormStep>;
}

export interface UpdateQuestFormStep {
	_id: any;
    actor: string;
    duration: number;
    line: string;
    editor: {
        position: {
            x: number,
            y: number
        }
    };
    randomSteps: Array<{
        chance: number;
        goToStepId: string
    }>;

}
