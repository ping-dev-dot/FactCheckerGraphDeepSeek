export interface ClaimItem {
  id?: string | number;
  claim: string;
  typ?: string;
  schwierigkeit?: number;
  schwierigkeit_begruendung?: string;
  speakerId?: string;
}

export function postprocessConclusions(text: string, claims: ClaimItem[]): ClaimItem[] {
  const conclusionMarkers = /(?:^|[.?!]\s+|\n)(Therefore|Thus|Hence|So|Consequently|It follows that|This means that|Daraus folgt|Deshalb|Darum|Somit|Folglich)\b[,:]?\s*/gim;
  const existingTexts = new Set(
    claims.map((c) => c.claim.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim())
  );

  let result = [...claims];
  let match;

  while ((match = conclusionMarkers.exec(text)) !== null) {
    const afterMarker = text.slice(match.index + match[0].length);
    const sentenceMatch = afterMarker.match(/^([^.?!]+[.?!]?)/);

    if (sentenceMatch) {
      const conclusionText = sentenceMatch[1].trim();
      if (conclusionText.length > 15) {
        const normalized = conclusionText.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
        const isDuplicate = [...existingTexts].some(
          (et) => et.includes(normalized) || normalized.includes(et)
        );

        if (!isDuplicate) {
          result.push({
            id: result.length + 1,
            claim: conclusionText,
            typ: "faktisch",
            schwierigkeit: 50,
            schwierigkeit_begruendung: "Automatisch als Schlussfolgerung erkannt",
          });
          existingTexts.add(normalized);
        }
      }
    }
  }

  return result;
}
