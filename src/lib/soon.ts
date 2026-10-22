/**
 * "Do it right after the response" for work queued inside a transaction (an email, a push, an
 * announcement). Any request's after-response hook may look, including one that runs before the
 * queuing transaction commits: so the mark isn't consumed, it stays up for a while and every look
 * runs the work. That work claims its rows, so running it twice never sends anything twice.
 */
export function soon(windowMs = 30_000) {
  let until = 0;

  return {
    mark: () => {
      until = Date.now() + windowMs;
    },
    pending: () => Date.now() < until,
  };
}
