"use client";

import classNames from "classnames";
import { ROOM_COLORS } from "app/lib/constants";
import { FLOORPLAN } from "lib/rooms/floorplan";

interface OpenSpaceEvent {
  location?: string;
}

type OpenSpaceMapProps = {
  event: OpenSpaceEvent | null;
  events?: OpenSpaceEvent[];
  scene?: number;
  onRoomClick?: (roomName: string) => void;
};

export default function OpenSpaceMap({ event, onRoomClick }: OpenSpaceMapProps) {
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
        pointerEvents="all"
        onClick={() => onRoomClick?.("LOBBY")}
        onMouseEnter={(e) => {
          if (!isLobbySelected) {
            const path = e.currentTarget.querySelector("path");
            if (path) {
              path.style.fill = ROOM_COLORS.LOBBY;
              path.style.stroke = ROOM_COLORS.LOBBY;
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
          fill={isLobbySelected ? ROOM_COLORS.LOBBY : "transparent"}
          style={{
            stroke: isLobbySelected ? ROOM_COLORS.LOBBY : "white",
            fill: isLobbySelected ? ROOM_COLORS.LOBBY : "transparent",
          }}
        />
        <text
          className={classNames(
            "font-inter pointer-events-none text-[28px] group-hover:fill-black group-hover:stroke-black",
            {
              "fill-black stroke-black": event?.location === "LOBBY",
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
        pointerEvents="all"
        onClick={() => onRoomClick?.("RINCÓN")}
        onMouseEnter={(e) => {
          if (!isRinconSelected) {
            const path = e.currentTarget.querySelector("path");
            if (path) {
              path.style.fill = ROOM_COLORS.RINCÓN;
              path.style.stroke = ROOM_COLORS.RINCÓN;
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
            stroke: isRinconSelected ? ROOM_COLORS.RINCÓN : "white",
            fill: isRinconSelected ? ROOM_COLORS.RINCÓN : "transparent",
          }}
        />
        <text
          className={classNames(
            "font-inter pointer-events-none text-[28px] group-hover:fill-black group-hover:stroke-black",
            {
              "fill-black stroke-black": event?.location === "RINCÓN",
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
        pointerEvents="all"
        onClick={() => onRoomClick?.("CENTRO")}
        onMouseEnter={(e) => {
          if (!isCentroSelected) {
            const path = e.currentTarget.querySelector("path");
            if (path) {
              path.style.fill = ROOM_COLORS.CENTRO;
              path.style.stroke = ROOM_COLORS.CENTRO;
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
            stroke: isCentroSelected ? ROOM_COLORS.CENTRO : "white",
            fill: isCentroSelected ? ROOM_COLORS.CENTRO : "transparent",
          }}
        />
        <text
          className={classNames(
            "font-inter pointer-events-none text-[28px] group-hover:fill-black group-hover:stroke-black",
            {
              "fill-black stroke-black": event?.location === "CENTRO",
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
        pointerEvents="all"
        onClick={() => onRoomClick?.("VENTANA")}
        onMouseEnter={(e) => {
          if (!isVentanaSelected) {
            const path = e.currentTarget.querySelector("path");
            if (path) {
              path.style.fill = ROOM_COLORS.VENTANA;
              path.style.stroke = ROOM_COLORS.VENTANA;
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
            stroke: isVentanaSelected ? ROOM_COLORS.VENTANA : "white",
            fill: isVentanaSelected ? ROOM_COLORS.VENTANA : "transparent",
          }}
        />
        <text
          className={classNames(
            "font-inter pointer-events-none text-[28px] group-hover:fill-black group-hover:stroke-black",
            {
              "fill-black stroke-black": event?.location === "VENTANA",
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
        pointerEvents="all"
        onClick={() => onRoomClick?.("CUEVA")}
        onMouseEnter={(e) => {
          if (!isCuevaSelected) {
            const path = e.currentTarget.querySelector("path");
            if (path) {
              path.style.fill = ROOM_COLORS.CUEVA;
              path.style.stroke = ROOM_COLORS.CUEVA;
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
            stroke: isCuevaSelected ? ROOM_COLORS.CUEVA : "white",
            fill: isCuevaSelected ? ROOM_COLORS.CUEVA : "transparent",
          }}
        />
        <text
          className={classNames(
            "font-inter pointer-events-none text-[28px] group-hover:fill-black group-hover:stroke-black",
            {
              "fill-black stroke-black": event?.location === "CUEVA",
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
