const AWS_WAF_INSTRUCTION =
  /(?:type|enter|write|repeat)?\s*(?:any\s+)?one\s+of\s+the\s+two\s+following\s+words?\s+spoken\s+by\s+me[\s.,:;!?-]*/i
const WORD = /[a-z0-9]+(?:['\u2019-][a-z0-9]+)*/gi
const LEADING_FILLERS = new Set(["a", "an", "the", "and", "or"])

export function extractAwsWafAudioCandidates(transcript: string | undefined): string[] {
  if (!transcript) return []

  const normalized = normalizeAwsWafAudioTranscript(transcript)
  if (!normalized) return []

  const instruction = AWS_WAF_INSTRUCTION.exec(normalized)
  const spokenByMe = normalized.lastIndexOf("spoken by me")
  const markerEnd = instruction
    ? (instruction.index ?? 0) + instruction[0].length
    : spokenByMe >= 0
      ? spokenByMe + "spoken by me".length
      : -1

  if (markerEnd >= 0) {
    const words = normalized.slice(markerEnd).match(WORD) ?? []
    while (words.length > 0) {
      const first = words[0]
      if (!first || !LEADING_FILLERS.has(first)) break
      words.shift()
    }
    return words.slice(0, 2)
  }

  const words = normalized.match(WORD) ?? []
  const last = words.at(-1)
  return last ? [last] : []
}

export function extractAwsWafAudioAnswer(transcript: string | undefined): string | undefined {
  return extractAwsWafAudioCandidates(transcript)[0]
}

export function normalizeAwsWafAudioTranscript(text: string): string {
  return text.toLowerCase().trim().replace(/\s+/g, " ")
}
