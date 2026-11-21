/**
 * A tap the operator can feel, so a TAKE from the phone is confirmed without
 * looking at the screen: the Vibration API where it exists (Android), and on
 * iPhone the one haptic Safari exposes — a native `switch` checkbox toggling
 * (iOS 18+). Only works inside a user gesture; silent elsewhere.
 */
export function haptic(pattern: number | number[] = 10) {
  if (typeof navigator === "undefined") return;
  if (typeof navigator.vibrate === "function") {
    navigator.vibrate(pattern);

    return;
  }
  const touchApple = /iP(hone|ad|od)/.test(navigator.userAgent) || navigator.maxTouchPoints > 1;
  if (!touchApple) return;
  const label = document.createElement("label");
  label.ariaHidden = "true";
  label.style.display = "none";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.setAttribute("switch", "");
  label.append(input);
  document.head.append(label);
  label.click();
  label.remove();
}
