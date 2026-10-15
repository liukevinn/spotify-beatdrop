export const ERRORS = {
  VALIDATION: { status: 400, message: "That request wasn't valid." },
  UNAUTHENTICATED: { status: 401, message: "Log in to DropSet first." },
  REAUTH_REQUIRED: { status: 401, message: "Log in to DropSet again." },
  PREMIUM_REQUIRED: { status: 403, message: "Spotify Premium is required." },
  SPOTIFY_FORBIDDEN: {
    status: 403,
    message: "This Spotify account isn't enabled for DropSet.",
  },
  NOT_FOUND: { status: 404, message: "Not found." },
  NOTHING_PLAYING: { status: 409, message: "Nothing is playing on Spotify." },
  UNSUPPORTED_TRACK: { status: 409, message: "Local files can't be tagged." },
  NO_DROPS: { status: 409, message: "Tag some drops first." },
  NO_SETS: { status: 409, message: "No set has been cued yet." },
  NO_DEVICE: { status: 409, message: "Open Spotify on your phone and try again." },
  RATE_LIMITED: { status: 429, message: "Spotify is busy. Try again in a moment." },
  TRACK_UNAVAILABLE: { status: 502, message: "Couldn't play that track. Try again." },
  SPOTIFY_ERROR: { status: 502, message: "Spotify didn't respond. Try again." },
  INTERNAL: { status: 500, message: "Something went wrong. Try again." },
} as const satisfies Record<string, { status: number; message: string }>;

export type ErrorCode = keyof typeof ERRORS;

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;

  constructor(code: ErrorCode, message?: string) {
    super(message ?? ERRORS[code].message);
    this.name = "AppError";
    this.code = code;
    this.status = ERRORS[code].status;
  }
}

/** Non-2xx Spotify response that no specific handler claimed. */
export class SpotifyHttpError extends AppError {
  readonly httpStatus: number;
  readonly reason: string | undefined;

  constructor(httpStatus: number, reason?: string) {
    super("SPOTIFY_ERROR");
    this.name = "SpotifyHttpError";
    this.httpStatus = httpStatus;
    this.reason = reason;
  }
}
