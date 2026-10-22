import { describe, expect, test } from "vitest";

import { describeAiFailure } from "./models";

/** The gateway's auth error as it reaches the card reader: named, but without its status code. */
const gatewayAuth = (message: string) => Object.assign(new Error(message), { name: "GatewayAuthenticationError" });
const NO_KEY = "La IA no está configurada en este servidor: falta la clave de la AI Gateway (AI_GATEWAY_API_KEY).";

describe(describeAiFailure, () => {
  test("a server without a key says so in Spanish, however the SDK words it", () => {
    // The card reader: the gateway's named error with its setup instructions.
    expect(
      describeAiFailure(
        gatewayAuth("Unauthenticated request to AI Gateway.\n\nTo authenticate, set the AI_GATEWAY_API_KEY …")
      )
    ).toBe(NO_KEY);
    // The slot picker hears it as a 401 with other words.
    const decision = Object.assign(
      new Error("AI Gateway authentication failed: No authentication provided. Option 1 - API key: …"),
      { statusCode: 401 }
    );
    expect(describeAiFailure(decision)).toBe(NO_KEY);
    // Owy's chat gets the plain SDK text.
    expect(
      describeAiFailure(
        new Error(
          "Unauthenticated request to AI Gateway. To authenticate, set the AI_GATEWAY_API_KEY environment variable."
        )
      )
    ).toBe(NO_KEY);
  });

  test("a rejected account keeps the upstream reason, which is what someone has to go fix", () => {
    expect(describeAiFailure(gatewayAuth("Invalid API key"))).toBe("La AI Gateway rechazó el pedido: Invalid API key");
    expect(describeAiFailure(Object.assign(new Error("card required"), { statusCode: 403 }))).toBe(
      "La AI Gateway rechazó el pedido (403): card required"
    );
  });

  test("other failures keep the upstream detail, so the cause can be acted on", () => {
    expect(describeAiFailure(Object.assign(new Error("quota"), { statusCode: 429 }))).toBe(
      "La AI Gateway está limitando los pedidos: quota"
    );
    expect(describeAiFailure(new Error("timeout"))).toBe("Falló la llamada a la IA: timeout");
  });
});
