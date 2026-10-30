import { channels } from "./channels";
import epg_client from "./epg_client";

export const fetchChannels = async () => new Promise((res) => res(channels));

export const fetchEpgClient = async () => await epg_client();
