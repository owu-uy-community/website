import OpenSpaceClient from "./OpenSpaceClient";

// Fully client-side page with oRPC batching
// All data fetching happens on the client using batched oRPC requests
export default function LaMeetup2025OpenSpacePage() {
  return <OpenSpaceClient />;
}
