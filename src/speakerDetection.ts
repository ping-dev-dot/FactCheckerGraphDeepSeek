/**
 * Regex-based speaker detection and text segmentation.
 * Detects named/role-based speakers and segments text by speaker turns.
 */

import type { Speaker } from "./types";
import { SPEAKER_COLORS } from "./types";

export interface SpeakerSegment {
  speakerId: string;
  text: string;
}

export interface SpeakerDetectionResult {
  speakers: Speaker[];
  segments: SpeakerSegment[];
}

// Common words that look like names but aren't (when followed by colon)
const NON_NAME_WORDS = new Set([
  "Will", "May", "Can", "Should", "Could", "Would", "Must", "The",
  "However", "Therefore", "Furthermore", "Moreover", "Meanwhile",
  "First", "Second", "Third", "Finally", "Next", "Then", "Now",
  "Yes", "No", "But", "And", "So", "If", "When", "While", "Because",
  "It", "This", "That", "These", "Those", "We", "You", "They",
  "Note", "Important", "Question", "Answer", "A", "An", "In", "On",
  "For", "To", "With", "Without", "After", "Before", "During",
  "Instead", "Rather", "Thus", "Hence",
]);

function isLikelyName(word: string): boolean {
  if (NON_NAME_WORDS.has(word)) return false;
  // Must start with capital letter and be 2-20 chars
  if (!/^[A-Z][a-z]{1,19}$/.test(word)) return false;
  return true;
}

/**
 * Detect speakers in the given text and segment by speaker turns.
 * If no explicit speaker markers are found, returns a single "Speaker".
 */
export function detectSpeakers(text: string): SpeakerDetectionResult {
  const speakerMap = new Map<string, Speaker>();
  const segments: SpeakerSegment[] = [];
  let nextSpeakerIndex = 0;

  function assignSpeaker(name: string, colorIndex: number): string {
    const id = `speaker_${name.toLowerCase().replace(/\s+/g, "_")}`;
    if (!speakerMap.has(id)) {
      speakerMap.set(id, {
        id,
        name,
        color: SPEAKER_COLORS[colorIndex % SPEAKER_COLORS.length],
      });
    }
    return id;
  }

  // Try to find speaker patterns
  const pattern = /^(?:([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s*(?:\([^)]+\))?\s*:|(Interviewer|Host|Guest|Moderator|Caller|Panelist)(?:\s+\d+)?\s*:)/gm;

  const matches: { index: number; name: string; end: number }[] = [];
  let match;
  while ((match = pattern.exec(text)) !== null) {
    const name = match[1] || match[2];
    if (name && isLikelyName(name.split(" ")[0])) {
      matches.push({
        index: match.index,
        name,
        end: match.index + match[0].length,
      });
    }
  }

  if (matches.length === 0) {
    // No explicit speakers detected — single speaker
    const id = assignSpeaker("Speaker", 0);
    segments.push({ speakerId: id, text });
    return {
      speakers: Array.from(speakerMap.values()),
      segments,
    };
  }

  // Segment text by speaker turns
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const start = m.end;
    const end = i < matches.length - 1 ? matches[i + 1].index : text.length;
    let segText = text.slice(start, end).trim();

    // Merge consecutive same-speaker segments
    if (
      i > 0 &&
      matches[i].name === matches[i - 1].name &&
      end - matches[i - 1].end < 500
    ) {
      // Short gap — likely continuation, append to last segment
      segments[segments.length - 1].text += " " + segText;
      continue;
    }

    const speakerId = assignSpeaker(matches[i].name, nextSpeakerIndex++);
    segments.push({ speakerId, text: segText });
  }

  // If no valid segments (all names filtered out), fall back to single speaker
  if (segments.length === 0) {
    const id = assignSpeaker("Speaker", 0);
    segments.push({ speakerId: id, text });
  }

  return {
    speakers: Array.from(speakerMap.values()),
    segments,
  };
}
