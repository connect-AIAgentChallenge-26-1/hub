package com.placepick.session;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Objects;
import java.util.UUID;
import java.util.regex.Pattern;
import org.springframework.stereotype.Component;

@Component
public final class SessionTokenCodec {

    private static final int TOKEN_BYTES = 32;
    private static final Pattern TOKEN_FORMAT = Pattern.compile("[A-Za-z0-9_-]{43}");

    private final SecureRandom secureRandom;

    public SessionTokenCodec() {
        this(new SecureRandom());
    }

    SessionTokenCodec(SecureRandom secureRandom) {
        this.secureRandom = Objects.requireNonNull(secureRandom, "secureRandom");
    }

    public String issue() {
        byte[] bytes = new byte[TOKEN_BYTES];
        secureRandom.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    public boolean hasValidFormat(String token) {
        return token != null && TOKEN_FORMAT.matcher(token).matches();
    }

    public String hash(String token) {
        if (!hasValidFormat(token)) {
            throw new IllegalArgumentException("Token has an invalid format.");
        }
        return HexFormat.of().formatHex(digest(token));
    }

    public boolean matches(String token, String expectedHash) {
        if (!hasValidFormat(token) || expectedHash == null || expectedHash.length() != 64) {
            return false;
        }
        byte[] actual = hash(token).getBytes(StandardCharsets.US_ASCII);
        byte[] expected = expectedHash.getBytes(StandardCharsets.US_ASCII);
        return MessageDigest.isEqual(actual, expected);
    }

    public String safetyIdentifier(UUID sessionId) {
        byte[] digest = digest(Objects.requireNonNull(sessionId, "sessionId").toString());
        return Base64.getUrlEncoder().withoutPadding().encodeToString(digest);
    }

    private byte[] digest(String value) {
        try {
            return MessageDigest.getInstance("SHA-256")
                .digest(value.getBytes(StandardCharsets.UTF_8));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is not available.", exception);
        }
    }
}
