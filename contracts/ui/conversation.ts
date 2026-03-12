export interface Conversation {
    id: string
    title: string
    title_source?: 'default' | 'user' | 'auto'
    created_at: number
    updated_at: number
    model: string
    archived: boolean
    strategy_id?: string | null
    strategy_key?: string | null
    strategy_version?: string | null
}
