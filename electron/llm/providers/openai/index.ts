import { createOpenAICompatibleProvider } from '../openaiCompatible'

export const OpenAIProvider = createOpenAICompatibleProvider({
    id: 'openai',
    defaultBaseUrl: 'https://api.openai.com/v1',
    capabilities: {
        nativeFiles: true,
        attachmentTransport: 'remote_file_id',
    },
})
