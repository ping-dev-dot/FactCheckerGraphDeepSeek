import type { Preset } from "./types";

export const PRESETS: Preset[] = [
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
