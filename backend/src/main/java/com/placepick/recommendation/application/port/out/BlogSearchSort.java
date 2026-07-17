package com.placepick.recommendation.application.port.out;

/** Provider-neutral blog search ordering mapped only at the Naver adapter boundary. */
public enum BlogSearchSort {
    SIMILARITY("sim");

    private final String providerValue;

    BlogSearchSort(String providerValue) {
        this.providerValue = providerValue;
    }

    public String providerValue() {
        return providerValue;
    }
}
