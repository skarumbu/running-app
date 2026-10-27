/** Turns a non-ok API response into an Error carrying the server's message. */
export async function errorFromResponse(res: Response): Promise<Error> {
  if (res.status === 401) {
    return new Error('Your session expired — sign out and sign in again, then try again.');
  }
  let message = `Unexpected error (${res.status})`;
  try {
    const body = await res.json();
    if (body?.error) message = body.error;
  } catch {
    // response wasn't JSON; keep the generic message above
  }
  return new Error(message);
}

/** A message for the user from anything a request can throw. */
export function describeRequestError(e: unknown): string {
  // fetch() itself rejects with a TypeError when the request never reaches
  // the server (offline, CORS, DNS), distinct from a non-ok server response.
  if (e instanceof TypeError) return "Couldn't reach the server — check your connection and try again.";
  return e instanceof Error ? e.message : String(e);
}
