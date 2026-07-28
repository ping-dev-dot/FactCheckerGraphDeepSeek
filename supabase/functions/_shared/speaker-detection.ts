export interface Speaker {
  id: string;
  name: string;
  color: string;
}

export interface SpeakerSegment {
  speakerId: string;
  text: string;
}

export interface SpeakerDetectionResult {
  speakers: Speaker[];
  segments: SpeakerSegment[];
}

export const SPEAKER_COLORS = [
  "#2563eb", // blue
  "#7c3aed", // purple
  "#db2777", // pink
  "#ea580c", // orange
  "#16a34a", // green
  "#0891b2", // cyan
];

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
  if (!/^[A-Z][a-z]{1,19}$/.test(word)) return false;
  return true;
}

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
    const id = assignSpeaker("Speaker", 0);
    segments.push({ speakerId: id, text });
    return {
      speakers: Array.from(speakerMap.values()),
      segments,
    };
  }

  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const start = m.end;
    const end = i < matches.length - 1 ? matches[i + 1].index : text.length;
    let segText = text.slice(start, end).trim();

    if (
      i > 0 &&
      matches[i].name === matches[i - 1].name &&
      end - matches[i - 1].end < 500
    ) {
      segments[segments.length - 1].text += " " + segText;
      continue;
    }

    const speakerId = assignSpeaker(matches[i].name, nextSpeakerIndex++);
    segments.push({ speakerId, text: segText });
  }

  if (segments.length === 0) {
    const id = assignSpeaker("Speaker", 0);
    segments.push({ speakerId: id, text });
  }

  return {
    speakers: Array.from(speakerMap.values()),
    segments,
  };
}
