package com.placepick.security;

import com.placepick.session.SessionAuthenticator;
import com.placepick.session.SessionTokenCodec;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.Optional;
import org.springframework.web.util.WebUtils;

final class ApiClientIdentityResolver {

    private final SessionTokenCodec tokenCodec;

    ApiClientIdentityResolver(SessionTokenCodec tokenCodec) {
        this.tokenCodec = tokenCodec;
    }

    ClientIdentities resolve(HttpServletRequest request) {
        String remoteAddress = request.getRemoteAddr();
        String ipKey = digest("ip|" + (remoteAddress == null ? "unknown" : remoteAddress));
        Cookie cookie = WebUtils.getCookie(request, SessionAuthenticator.SESSION_COOKIE);
        Optional<String> sessionKey = cookie != null
            && tokenCodec.hasValidFormat(cookie.getValue())
            ? Optional.of(digest("session|" + cookie.getValue()))
            : Optional.empty();
        return new ClientIdentities(ipKey, sessionKey);
    }

    private static String digest(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                .digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable.", exception);
        }
    }

    record ClientIdentities(String ipKey, Optional<String> sessionKey) {
    }
}
