package com.placepick.recommendation.application.port.out;

/** Provider-neutral local search ordering mapped only at the Naver adapter boundary. */
public enum PlaceSearchSort {
    ACCURACY("random"),
    POPULARITY("comment");

    private final String providerValue;

    PlaceSearchSort(String providerValue) {
        this.providerValue = providerValue;
    }

    public String providerValue() {
        return providerValue;
    }
}
