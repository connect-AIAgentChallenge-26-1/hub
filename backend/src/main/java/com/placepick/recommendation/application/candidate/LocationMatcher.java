package com.placepick.recommendation.application.candidate;

public final class LocationMatcher {

    private final LocationResolver resolver;

    public LocationMatcher() {
        this(new LocationResolver());
    }

    public LocationMatcher(LocationResolver resolver) {
        this.resolver = resolver;
    }

    public boolean matches(String locationQuery, String address, String roadAddress) {
        return resolve(locationQuery, address, roadAddress, true).accepted();
    }

    public LocationMatch resolve(
        String locationQuery,
        String address,
        String roadAddress,
        boolean providerRelevant
    ) {
        return resolver.resolve(locationQuery, address, roadAddress, providerRelevant);
    }
}
