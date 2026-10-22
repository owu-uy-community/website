/** Comunicación's sections, in order; also what `?tab=` accepts. */
export const COMMS_TABS = ["anuncios", "owy", "cadencia", "encuesta"] as const;
export type CommsTab = (typeof COMMS_TABS)[number];
