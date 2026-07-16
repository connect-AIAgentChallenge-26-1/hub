package com.placepick.recommendation.domain.scoring;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;

/** Evidence-based recommendation score v2. Required type/exclusion rules are filters, not points. */
public record ScoreBreakdown(
    int locationConfidence,
    int searchRelevance,
    int preferenceEvidence,
    int evidenceQuality
) {

    public ScoreBreakdown {
        requireRange(locationConfidence, 0, 15, "locationConfidence");
        requireRange(searchRelevance, 0, 30, "searchRelevance");
        requireRange(preferenceEvidence, 0, 30, "preferenceEvidence");
        requireRange(evidenceQuality, 0, 25, "evidenceQuality");
        if (total() > 100) {
            throw new IllegalArgumentException("Score total must not exceed 100.");
        }
    }

    /** Transitional constructor for stored/test v1 call sites; new code must use the v2 shape. */
    public ScoreBreakdown(
        int legacyLocation,
        int legacyPlaceType,
        int legacyBudget,
        int legacyPreference,
        int legacyBlogEvidence
    ) {
        this(
            legacyLocation(legacyLocation),
            legacySearchRelevance(legacyPlaceType),
            legacyPreferenceEvidence(legacyPreference),
            legacyEvidenceQuality(
                legacyLocation,
                legacyPlaceType,
                legacyBudget,
                legacyPreference,
                legacyBlogEvidence
            )
        );
    }

    @JsonProperty("total")
    public int total() {
        return locationConfidence + searchRelevance + preferenceEvidence + evidenceQuality;
    }

    /** Reads both persisted v1 snapshots and the exact v2 JSON contract. */
    @JsonCreator(mode = JsonCreator.Mode.PROPERTIES)
    public static ScoreBreakdown fromJson(
        @JsonProperty("locationConfidence") Integer locationConfidence,
        @JsonProperty("searchRelevance") Integer searchRelevance,
        @JsonProperty("preferenceEvidence") Integer preferenceEvidence,
        @JsonProperty("evidenceQuality") Integer evidenceQuality,
        @JsonProperty("location") Integer legacyLocation,
        @JsonProperty("placeType") Integer legacyPlaceType,
        @JsonProperty("budget") Integer legacyBudget,
        @JsonProperty("preference") Integer legacyPreference,
        @JsonProperty("blogEvidence") Integer legacyBlogEvidence,
        @JsonProperty("total") Integer declaredTotal
    ) {
        boolean v2 = locationConfidence != null || searchRelevance != null ||
            preferenceEvidence != null || evidenceQuality != null;
        if (v2) {
            if (locationConfidence == null || searchRelevance == null ||
                preferenceEvidence == null || evidenceQuality == null) {
                throw new IllegalArgumentException("Score v2 JSON must contain every component.");
            }
            ScoreBreakdown result = new ScoreBreakdown(
                locationConfidence,
                searchRelevance,
                preferenceEvidence,
                evidenceQuality
            );
            requireDeclaredTotal(result, declaredTotal);
            return result;
        }
        if (legacyLocation == null || legacyPlaceType == null || legacyBudget == null ||
            legacyPreference == null || legacyBlogEvidence == null) {
            throw new IllegalArgumentException("Score JSON does not match v1 or v2.");
        }
        ScoreBreakdown result = new ScoreBreakdown(
            legacyLocation,
            legacyPlaceType,
            legacyBudget,
            legacyPreference,
            legacyBlogEvidence
        );
        requireDeclaredTotal(result, declaredTotal);
        return result;
    }

    @JsonIgnore
    public int location() {
        return locationConfidence;
    }

    /** Transitional Java accessor; v2 treats type as a hard filter. */
    @JsonIgnore
    public int placeType() {
        return 0;
    }

    /** Transitional Java accessor; v2 does not infer budget evidence. */
    @JsonIgnore
    public int budget() {
        return 0;
    }

    @JsonIgnore
    public int preference() {
        return preferenceEvidence;
    }

    /** Transitional Java accessor; use evidenceQuality. */
    @JsonIgnore
    public int blogEvidence() {
        return evidenceQuality;
    }

    private static void requireRange(int value, int min, int max, String field) {
        if (value < min || value > max) {
            throw new IllegalArgumentException(field + " score is outside its policy range.");
        }
    }

    private static int legacyLocation(int value) {
        requireRange(value, 0, 30, "legacyLocation");
        return value / 2;
    }

    private static int legacySearchRelevance(int value) {
        requireRange(value, 0, 25, "legacyPlaceType");
        return value;
    }

    private static int legacyPreferenceEvidence(int value) {
        requireRange(value, 0, 15, "legacyPreference");
        return value * 2;
    }

    private static int legacyEvidenceQuality(
        int location,
        int placeType,
        int budget,
        int preference,
        int blogEvidence
    ) {
        requireRange(budget, 0, 0, "budget");
        requireRange(blogEvidence, 0, 10, "legacyBlogEvidence");
        int legacyTotal = location + placeType + preference + blogEvidence;
        int migrated = legacyLocation(location) + legacySearchRelevance(placeType) +
            legacyPreferenceEvidence(preference);
        int evidenceQuality = legacyTotal - migrated;
        requireRange(evidenceQuality, 0, 25, "legacyEvidenceQuality");
        return evidenceQuality;
    }

    private static void requireDeclaredTotal(
        ScoreBreakdown score,
        Integer declaredTotal
    ) {
        if (declaredTotal != null && declaredTotal != score.total()) {
            throw new IllegalArgumentException("Score JSON total does not match its components.");
        }
    }
}
