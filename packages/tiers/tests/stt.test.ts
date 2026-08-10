import { describe, expect, test } from "bun:test"
import {
  audioFilename,
  googleFfmpegArgs,
  googleSampleRates,
  inferAudioContentType,
  parseGoogleTranscriptAlternatives,
  selectGoogleTranscript,
} from "../src/solvers/stt"

describe("audio CAPTCHA speech-to-text", () => {
  test("preserves AWS AAC MIME and filename information from a data URL", () => {
    const source = "data:audio/aac;base64,/9AA"
    expect(inferAudioContentType(source)).toBe("audio/aac")
    expect(audioFilename(inferAudioContentType(source))).toBe("audio.aac")
  })

  test("sniffs AAC when an upstream response omits Content-Type", () => {
    expect(inferAudioContentType("blob:https://example.com/id", "", new Uint8Array([0xff, 0xf1, 0x50, 0x80]))).toBe(
      "audio/aac",
    )
  })

  test("keeps native 16 kHz first for AWS/AAC and the reCAPTCHA 8 kHz fallback order otherwise", () => {
    expect(googleSampleRates("audio/aac", "aws-waf")).toEqual([16_000, 8_000])
    expect(googleSampleRates("audio/mpeg", "generic")).toEqual([8_000, 16_000])
  })

  test("converts each pass to explicit mono 16-bit FLAC without reading stdin", () => {
    expect(googleFfmpegArgs("input.aac", "output.flac", 16_000)).toEqual([
      "-nostdin",
      "-threads",
      "0",
      "-i",
      "input.aac",
      "-map",
      "0:a:0",
      "-vn",
      "-ar",
      "16000",
      "-ac",
      "1",
      "-sample_fmt",
      "s16",
      "-c:a",
      "flac",
      "output.flac",
      "-y",
      "-loglevel",
      "error",
    ])
  })

  test("parses all Google JSON-lines alternatives in final-result-first order", () => {
    const alternatives = parseGoogleTranscriptAlternatives(
      [
        JSON.stringify({ result: [{ alternative: [{ transcript: "first" }] }] }),
        JSON.stringify({ result: [{ alternative: [{ transcript: "final" }, { transcript: "final alt" }] }] }),
      ].join("\n"),
    )
    expect(alternatives.map(({ transcript }) => transcript)).toEqual(["final", "final alt", "first"])
  })

  test("selects the AWS-aware alternative instead of Google's misleading top result", () => {
    const transcript = selectGoogleTranscript(
      [
        { transcript: "type one of the two following words spoken by me", confidence: 0.98 },
        { transcript: "type one of the two following words spoken by me approach" },
        { transcript: "because it would be nice", confidence: 0.97 },
        { transcript: "because it would be deep spoken by me and church", confidence: 0.91 },
        { transcript: "do not type one of the two following words spoken by me other words", confidence: 0.99 },
        {
          transcript: "type one of the two following words spoken by me church and again",
          confidence: 0.84,
        },
      ],
      "aws-waf",
    )
    expect(transcript).toBe("type one of the two following words spoken by me church and again")
  })

  test("prefers an answer repeated across low-confidence rate alternatives", () => {
    expect(
      selectGoogleTranscript(
        [
          { transcript: "type one of the two following words spoken by me church and again" },
          { transcript: "type one of the two following words spoken by me approach and again" },
          { transcript: "type one of the two following words spoken by me church and again" },
        ],
        "aws-waf",
      ),
    ).toBe("type one of the two following words spoken by me church and again")
  })

  test("does not let a high-confidence instruction fragment outrank an answer-marked transcript", () => {
    expect(
      selectGoogleTranscript(
        [
          { transcript: "type one of the two following words spoken by me church and again", confidence: 0.65 },
          { transcript: "because it would be nice", confidence: 0.99 },
        ],
        "aws-waf",
      ),
    ).toBe("type one of the two following words spoken by me church and again")
  })

  test("preserves the first Google alternative for non-AWS challenges", () => {
    expect(
      selectGoogleTranscript(
        [
          { transcript: "Blue Seven", confidence: 0.8 },
          { transcript: "unrelated", confidence: 0.99 },
        ],
        "generic",
      ),
    ).toBe("blue seven")
  })
})
