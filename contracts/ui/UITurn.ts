import type { UIMessage } from './UIMessage';
import type { TurnStatus } from '../shared';

export interface UITurn {
    id: string;
    conversation_id: string;
    status: TurnStatus;     // Business status only: running/completed/aborted/error
    stopReason?: string | null;
    tseq?: number;

    user: UIMessage;
    assistants: UIMessage[];   // Currently active assistant messages (may include skeleton/loading)
    currentAssistantIndex: number
}
