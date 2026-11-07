"use client";

import type { CSSProperties } from "react";
import classNames from "classnames";
import { ROOM_COLORS, type RoomName } from "app/lib/constants";
import { FLOORPLAN } from "lib/rooms/floorplan";
import { readableOn } from "lib/rooms/palette";

interface OpenSpaceEvent {
  location?: string;
}

type OpenSpaceMapProps = {
  event: OpenSpaceEvent | null;
  events?: OpenSpaceEvent[];
  scene?: number;
  onRoomClick?: (roomName: string) => void;
  /** Fill per zone, from `rooms.color`; a zone left out keeps the 2024 palette. */
  colors?: Partial<Record<string, string>>;
};

export default function OpenSpaceMap({ event, onRoomClick, colors }: OpenSpaceMapProps) {
  const paint = (zone: RoomName) => colors?.[zone] ?? ROOM_COLORS[zone];
  // The label's colour when its room is lit: black or white, whichever reads on that fill
  const ink = (zone: RoomName) => ({ "--ink": readableOn(paint(zone)) }) as CSSProperties;
  const isLobbySelected = event?.location === "LOBBY";
  const isCentroSelected = event?.location === "CENTRO";
  const isVentanaSelected = event?.location === "VENTANA";
  const isCuevaSelected = event?.location === "CUEVA";
  const isRinconSelected = event?.location === "RINCÓN";

  return (
    <svg
      fill="none"
      viewBox="0 0 1315 654"
      xmlns="http://www.w3.org/2000/svg"
      className="h-full w-full"
      preserveAspectRatio="xMinYMid meet"
    >
      <g
        className="group cursor-pointer"
        id="lobby"
        style={ink("LOBBY")}
        pointerEvents="all"
        onClick={() => onRoomClick?.("LOBBY")}
        onMouseEnter={(e) => {
          if (!isLobbySelected) {
            const path = e.currentTarget.querySelector("path");
            if (path) {
              path.style.fill = paint("LOBBY");
              path.style.stroke = paint("LOBBY");
            }
          }
        }}
        onMouseLeave={(e) => {
          if (!isLobbySelected) {
            const path = e.currentTarget.querySelector("path");
            if (path) {
              path.style.fill = "transparent";
              path.style.stroke = "white";
            }
          }
        }}
      >
        <path
          d={FLOORPLAN.rooms.LOBBY}
          id="Vector"
          stroke="white"
          fill={isLobbySelected ? paint("LOBBY") : "transparent"}
          style={{
            stroke: isLobbySelected ? paint("LOBBY") : "white",
            fill: isLobbySelected ? paint("LOBBY") : "transparent",
          }}
        />
        <text
          className={classNames(
            "font-inter pointer-events-none text-[28px] group-hover:fill-(--ink) group-hover:stroke-(--ink)",
            {
              "fill-(--ink) stroke-(--ink)": event?.location === "LOBBY",
              "fill-white stroke-white": event?.location !== "LOBBY",
            }
          )}
          id="RINC&#195;&#131;&#194;&#147;N_8"
          letterSpacing="0em"
          xmlSpace="preserve"
        >
          <tspan x="119" y="382.182">
            LOBBY
          </tspan>
        </text>
      </g>

      <g
        className="group cursor-pointer"
        id="rincon"
        style={ink("RINCÓN")}
        pointerEvents="all"
        onClick={() => onRoomClick?.("RINCÓN")}
        onMouseEnter={(e) => {
          if (!isRinconSelected) {
            const path = e.currentTarget.querySelector("path");
            if (path) {
              path.style.fill = paint("RINCÓN");
              path.style.stroke = paint("RINCÓN");
            }
          }
        }}
        onMouseLeave={(e) => {
          if (!isRinconSelected) {
            const path = e.currentTarget.querySelector("path");
            if (path) {
              path.style.fill = "transparent";
              path.style.stroke = "white";
            }
          }
        }}
      >
        <path
          d={FLOORPLAN.rooms.RINCÓN}
          id="Vector_2"
          stroke="white"
          style={{
            stroke: isRinconSelected ? paint("RINCÓN") : "white",
            fill: isRinconSelected ? paint("RINCÓN") : "transparent",
          }}
        />
        <text
          className={classNames(
            "font-inter pointer-events-none text-[28px] group-hover:fill-(--ink) group-hover:stroke-(--ink)",
            {
              "fill-(--ink) stroke-(--ink)": event?.location === "RINCÓN",
              "fill-white stroke-white": event?.location !== "RINCÓN",
            }
          )}
          id="RINC&#195;&#131;&#194;&#147;N"
          letterSpacing="0em"
          xmlSpace="preserve"
        >
          <tspan x="1155" y="405.182">
            RINC&#xd3;N{" "}
          </tspan>
        </text>
      </g>

      <g
        className="group cursor-pointer"
        id="centro"
        style={ink("CENTRO")}
        pointerEvents="all"
        onClick={() => onRoomClick?.("CENTRO")}
        onMouseEnter={(e) => {
          if (!isCentroSelected) {
            const path = e.currentTarget.querySelector("path");
            if (path) {
              path.style.fill = paint("CENTRO");
              path.style.stroke = paint("CENTRO");
            }
          }
        }}
        onMouseLeave={(e) => {
          if (!isCentroSelected) {
            const path = e.currentTarget.querySelector("path");
            if (path) {
              path.style.fill = "transparent";
              path.style.stroke = "white";
            }
          }
        }}
      >
        <path
          d={FLOORPLAN.rooms.CENTRO}
          id="centro"
          stroke="white"
          style={{
            stroke: isCentroSelected ? paint("CENTRO") : "white",
            fill: isCentroSelected ? paint("CENTRO") : "transparent",
          }}
        />
        <text
          className={classNames(
            "font-inter pointer-events-none text-[28px] group-hover:fill-(--ink) group-hover:stroke-(--ink)",
            {
              "fill-(--ink) stroke-(--ink)": event?.location === "CENTRO",
              "fill-white stroke-white": event?.location !== "CENTRO",
            }
          )}
          id="RINC&#195;&#131;&#194;&#147;N_3"
          letterSpacing="0em"
          xmlSpace="preserve"
        >
          <tspan x="502" y="307.182">
            CENTRO
          </tspan>
        </text>
      </g>

      <g
        className="group cursor-pointer"
        id="ventana"
        style={ink("VENTANA")}
        pointerEvents="all"
        onClick={() => onRoomClick?.("VENTANA")}
        onMouseEnter={(e) => {
          if (!isVentanaSelected) {
            const path = e.currentTarget.querySelector("path");
            if (path) {
              path.style.fill = paint("VENTANA");
              path.style.stroke = paint("VENTANA");
            }
          }
        }}
        onMouseLeave={(e) => {
          if (!isVentanaSelected) {
            const path = e.currentTarget.querySelector("path");
            if (path) {
              path.style.fill = "transparent";
              path.style.stroke = "white";
            }
          }
        }}
      >
        <path
          d={FLOORPLAN.rooms.VENTANA}
          id="ventana"
          stroke="white"
          style={{
            stroke: isVentanaSelected ? paint("VENTANA") : "white",
            fill: isVentanaSelected ? paint("VENTANA") : "transparent",
          }}
        />
        <text
          className={classNames(
            "font-inter pointer-events-none text-[28px] group-hover:fill-(--ink) group-hover:stroke-(--ink)",
            {
              "fill-(--ink) stroke-(--ink)": event?.location === "VENTANA",
              "fill-white stroke-white": event?.location !== "VENTANA",
            }
          )}
          id="RINC&#195;&#131;&#194;&#147;N_5"
          letterSpacing="0em"
          xmlSpace="preserve"
        >
          <tspan x="478" y="104.182">
            VENTANA
          </tspan>
        </text>
      </g>

      <g
        className="group cursor-pointer"
        id="cueva"
        style={ink("CUEVA")}
        pointerEvents="all"
        onClick={() => onRoomClick?.("CUEVA")}
        onMouseEnter={(e) => {
          if (!isCuevaSelected) {
            const path = e.currentTarget.querySelector("path");
            if (path) {
              path.style.fill = paint("CUEVA");
              path.style.stroke = paint("CUEVA");
            }
          }
        }}
        onMouseLeave={(e) => {
          if (!isCuevaSelected) {
            const path = e.currentTarget.querySelector("path");
            if (path) {
              path.style.fill = "transparent";
              path.style.stroke = "white";
            }
          }
        }}
      >
        <path
          d={FLOORPLAN.rooms.CUEVA}
          id="Vector_3"
          stroke="white"
          style={{
            stroke: isCuevaSelected ? paint("CUEVA") : "white",
            fill: isCuevaSelected ? paint("CUEVA") : "transparent",
          }}
        />
        <text
          className={classNames(
            "font-inter pointer-events-none text-[28px] group-hover:fill-(--ink) group-hover:stroke-(--ink)",
            {
              "fill-(--ink) stroke-(--ink)": event?.location === "CUEVA",
              "fill-white stroke-white": event?.location !== "CUEVA",
            }
          )}
          id="RINC&#195;&#131;&#194;&#147;N_7"
          letterSpacing="0em"
          xmlSpace="preserve"
        >
          <tspan x="275" y="582.182">
            CUEVA
          </tspan>
        </text>
      </g>

      <g id="principal">
        <path d={FLOORPLAN.hatched[0]} id="Vector_4" stroke="white" />
        <g id="Group_3">
          <path d={FLOORPLAN.hatched[1]} id="Vector_5" stroke="white" />
          <g id="Group_4">
            <path d={FLOORPLAN.walls} id="Vector_6" stroke="white" />
            <path d={FLOORPLAN.annex} id="Vector_7" stroke="white" />
            <path d={FLOORPLAN.hatched[2]} id="Vector_8" stroke="white" />
            <path d={FLOORPLAN.hatched[3]} id="Vector_9" stroke="white" />
            <path d={FLOORPLAN.hatched[4]} id="Vector_10" stroke="white" />
          </g>
        </g>
      </g>
    </svg>
  );
}
