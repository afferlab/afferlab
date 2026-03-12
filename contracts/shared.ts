export type Role = 'user' | 'assistant' | 'system' | 'tool';

export type MsgType =
    | 'text'
    | 'image'
    | 'tool_call'
    | 'tool_result'
    | 'file'
    | 'system_note'
    | 'other';

export type MsgStatus = 'pending' | 'progress' | 'completed' | 'stopped' | 'error';

export type TurnStatus = 'running' | 'completed' | 'aborted' | 'error';
