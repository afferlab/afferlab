import { createOpenAICompatibleProvider } from '../openaiCompatible'

export const DeepSeekProvider = createOpenAICompatibleProvider({
    id: 'deepseek',
    defaultBaseUrl: 'https://api.deepseek.com/v1',
})
