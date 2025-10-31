import React from "react";

export default function Logo() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "1rem",
      }}
    >
      <img alt="OWU Uruguay logo" loading="lazy" src="/images/speakers/carpincho/picture.png" style={{ maxWidth: "250px" }} />
      <h1
        style={{
          color: "white",
          fontSize: "1.8rem",
          fontWeight: "bold",
          textAlign: "center",
        }}
      >
        Autenticación | OWU Admin Panel
      </h1>
    </div>
  );
}
