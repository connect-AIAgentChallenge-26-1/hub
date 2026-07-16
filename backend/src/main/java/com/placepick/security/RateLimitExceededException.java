package com.placepick.security;

import java.io.Serial;

/** Safe public signal; it contains no client identity, address, cookie, or request payload. */
public final class RateLimitExceededException extends RuntimeException {

    @Serial
    private static final long serialVersionUID = 1L;

    private final long retryAfterSeconds;

    public RateLimitExceededException(long retryAfterSeconds) {
        super("The request rate limit was exceeded.", null, false, false);
        if (retryAfterSeconds < 1) {
            throw new IllegalArgumentException("Retry-After must be positive.");
        }
        this.retryAfterSeconds = retryAfterSeconds;
    }

    public long retryAfterSeconds() {
        return retryAfterSeconds;
    }
}
