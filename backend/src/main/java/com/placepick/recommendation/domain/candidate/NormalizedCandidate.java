package com.placepick.recommendation.domain.candidate;

import com.placepick.recommendation.application.candidate.LocationConfidence;
import com.placepick.recommendation.application.candidate.SearchObservation;
import java.util.List;
import java.util.Objects;

public record NormalizedCandidate(
    CandidateKey candidateKey,
    String name,
    String category,
    String description,
    String address,
    String roadAddress,
    String sourceUrl,
    String searchableText,
    String longitude,
    String latitude,
    LocationConfidence locationConfidence,
    List<SearchObservation> searchObservations
) {

    public NormalizedCandidate {
        candidateKey = Objects.requireNonNull(candidateKey, "candidateKey");
        name = requireNonBlank(name, "name");
        category = Objects.requireNonNull(category, "category");
        description = Objects.requireNonNull(description, "description");
        address = Objects.requireNonNull(address, "address");
        roadAddress = Objects.requireNonNull(roadAddress, "roadAddress");
        sourceUrl = SourceUrlPolicy.nullableValid(sourceUrl);
        searchableText = Objects.requireNonNull(searchableText, "searchableText");
        longitude = Objects.requireNonNull(longitude, "longitude");
        latitude = Objects.requireNonNull(latitude, "latitude");
        locationConfidence = Objects.requireNonNull(locationConfidence, "locationConfidence");
        searchObservations = List.copyOf(searchObservations);
        if (searchObservations.stream().map(SearchObservation::variantId).distinct().count() !=
            searchObservations.size()) {
            throw new IllegalArgumentException("Candidate search observations must be unique by variant.");
        }
    }

    public NormalizedCandidate(
        CandidateKey candidateKey,
        String name,
        String category,
        String description,
        String address,
        String roadAddress,
        String sourceUrl,
        String searchableText
    ) {
        this(
            candidateKey,
            name,
            category,
            description,
            address,
            roadAddress,
            sourceUrl,
            searchableText,
            "",
            "",
            LocationConfidence.EXACT,
            List.of()
        );
    }

    private static String requireNonBlank(String value, String field) {
        Objects.requireNonNull(value, field);
        if (value.isBlank()) {
            throw new IllegalArgumentException(field + " must not be blank.");
        }
        return value;
    }
}
