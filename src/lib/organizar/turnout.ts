import { DEFAULT_SHOW_RATE } from "./rules";

/**
 * How many people will actually come, and what to feed them. Free meetups lose a third to half of
 * their sign-ups (Meetup: 40–50% show; PheedLoop: 28% median no-show, 37% for small free events);
 * the community's own door data replaces the default once it has three events of it.
 */

export type TurnoutInput = {
  /** People with a seat */
  attending: number;
  /** Their +1s */
  guests: number;
  /** Of the people with a seat, those who answered "Voy" to the reminder */
  confirmed: number;
  /** The community's show-up rate (came / had a seat), or null without enough door data */
  showRate: number | null;
};

/** The range to plan for: everyone who confirmed comes (almost), the rest at the show rate. */
export function expectedTurnout({ attending, guests, confirmed, showRate }: TurnoutInput) {
  const rate = showRate ?? DEFAULT_SHOW_RATE;
  const people = attending + guests;
  const unconfirmed = Math.max(0, people - confirmed);
  const likely = Math.round(confirmed * 0.9 + unconfirmed * rate);
  // ±10 points on the rate for the unconfirmed: a range, never a false precise number
  const low = Math.round(confirmed * 0.85 + unconfirmed * Math.max(0, rate - 0.1));
  const high = Math.min(people, Math.round(confirmed + unconfirmed * Math.min(1, rate + 0.1)));

  return { likely, low, high, rate, fromHistory: showRate !== null };
}

/**
 * Pizza for `people`: 2.5 slices each plus 10%, 8 slices a pizza; at least a quarter veggie, one
 * gluten-free per 50 people (or one per person who said so), two drinks each.
 */
export function foodFor(people: number, diets: { vegetarian?: number; glutenFree?: number } = {}) {
  if (people <= 0) return { pizzas: 0, veggie: 0, glutenFree: 0, drinks: 0 };
  const pizzas = Math.ceil(((people * 2.5) / 8) * 1.1);
  const glutenFree = Math.max(diets.glutenFree ?? 0, Math.ceil(people / 50));
  const veggie = Math.max(Math.ceil(pizzas / 4), Math.ceil(((diets.vegetarian ?? 0) * 2.5) / 8));

  return { pizzas, veggie: Math.min(veggie, pizzas), glutenFree, drinks: people * 2 };
}

/** The sign-up limit a room can take: capacity ÷ show rate, so the room ends up full, not overfull. */
export const suggestedLimit = (roomCapacity: number, showRate: number | null) =>
  Math.floor(roomCapacity / (showRate ?? DEFAULT_SHOW_RATE));
