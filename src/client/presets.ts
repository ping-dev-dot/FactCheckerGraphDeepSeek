import type { Preset } from "../shared/types";

export const PRESETS: Preset[] = [
  {
    id: "multispeaker",
    label: "Multi-Speaker Debate",
    description: "Two speakers debate climate policy (Alice vs Bob)",
    text: `Alice: Climate change is the most urgent crisis facing humanity. We need to invest trillions in renewable energy immediately.

Bob: I think that's completely wrong. Renewable energy is too expensive and unreliable. We should focus on nuclear power instead.

Alice: But nuclear has its own risks — just look at Chernobyl and Fukushima. Solar and wind have gotten dramatically cheaper in the last decade.

Bob: That's cherry-picking. The cost of solar might have dropped, but you can't power a factory or a hospital with intermittent energy. Nuclear provides reliable baseload power and it's carbon-free.

Alice: So you're admitting climate change is a problem, then?

Bob: I never said it wasn't a problem. I said it's not the most urgent crisis. Economic stability matters more — if we destroy our economy chasing renewables, we won't have resources to address anything else.

Alice: That's a false dilemma. We can transition to renewables while maintaining economic growth. Germany and Denmark are doing it right now.`,
  },
  {
    id: "valid",
    label: "Valid Deductive Argument",
    description: "A clean deductive argument (modus ponens)",
    text: `All humans are mortal.
Socrates is a human.
Therefore, Socrates is mortal.`,
  },
  {
    id: "circular",
    label: "Circular Reasoning (Cyclic)",
    description: "An argument containing a logical loop",
    text: `We know the Bible is true because it is the word of God.
We know God exists because the Bible tells us so.
The Bible is the inerrant word of God because it says so itself.`,
  },
  {
    id: "fallacious",
    label: "Fallacious Argument",
    description: "An argument with Ad Hominem, Straw Man, and False Dilemma",
    text: `My opponent claims we should invest in renewable energy.
But he's a college dropout, so his opinion doesn't matter.
He wants to shut down all fossil fuel plants tomorrow and leave us without power.
Either we continue burning coal, or our economy collapses — there is no middle ground.
Renewable energy is just a fantasy pushed by elitists who don't understand hard-working people.`,
  },
];
