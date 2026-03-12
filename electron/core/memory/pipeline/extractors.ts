import { Ingest } from '../../ingest'

export async function extractTextFromBytes(
    sourceBytes: Uint8Array,
    args: { filename: string; mime: string },
): Promise<string> {
    const extracted = await Ingest.extractAuto(sourceBytes, {
        filename: args.filename,
        mime: args.mime,
    })
    return extracted.map(b => b.text).join('\n\n')
}
