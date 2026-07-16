package com.placepick.recommendation.application.candidate;

import com.placepick.recommendation.application.port.out.BlogSearchItem;
import com.placepick.recommendation.application.port.out.PlaceSearchItem;
import com.placepick.recommendation.condition.domain.ConfirmedRecommendationCondition;
import com.placepick.recommendation.domain.candidate.CandidateEvidence;
import com.placepick.recommendation.domain.candidate.CandidateKey;
import com.placepick.recommendation.domain.candidate.NormalizedCandidate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.TreeMap;
import java.util.TreeSet;

public final class CandidateNormalizer {

    private final CategoryTaxonomy taxonomy;
    private final LocationMatcher locationMatcher;

    public CandidateNormalizer(CategoryTaxonomy taxonomy, LocationMatcher locationMatcher) {
        this.taxonomy = taxonomy;
        this.locationMatcher = locationMatcher;
    }

    public List<NormalizedCandidate> normalizeEligible(
        List<PlaceSearchItem> source,
        ConfirmedRecommendationCondition condition
    ) {
        return normalizeEligibleWithFunnel(source, condition).candidates();
    }

    public CandidateNormalizationResult normalizeEligibleWithFunnel(
        List<PlaceSearchItem> source,
        ConfirmedRecommendationCondition condition
    ) {
        List<PlaceSearchItem> items = List.copyOf(source);
        EnumMap<CandidateRejectionReason, Integer> rejectionCounts =
            emptyRejectionCounts();
        List<RawCandidate> normalized = new ArrayList<>();
        for (PlaceSearchItem item : items) {
            Optional<RawCandidate> candidate = normalize(item);
            if (candidate.isEmpty()) {
                increment(rejectionCounts, CandidateRejectionReason.MISSING_IDENTITY);
                continue;
            }
            RawCandidate value = candidate.orElseThrow();
            if (!locationMatcher.matches(
                condition.locationQuery(), value.address(), value.roadAddress()
            )) {
                increment(rejectionCounts, CandidateRejectionReason.LOCATION);
                continue;
            }
            if (!taxonomy.matches(
                condition.placeType(),
                condition.placeTypeDetail(),
                value.name(),
                value.category()
            )) {
                increment(rejectionCounts, CandidateRejectionReason.TYPE);
                continue;
            }
            if (!doesNotContainExclusion(value, condition)) {
                increment(rejectionCounts, CandidateRejectionReason.EXCLUSION);
                continue;
            }
            normalized.add(value);
        }
        normalized.sort(RawCandidate.STABLE_ORDER);

        Map<String, List<RawCandidate>> byCanonicalLink = new TreeMap<>();
        for (RawCandidate candidate : normalized) {
            byCanonicalLink.computeIfAbsent(
                candidate.canonicalLink(),
                ignored -> new ArrayList<>()
            ).add(candidate);
        }

        List<CandidateCluster> clusters = new ArrayList<>();
        Map<String, List<List<RawCandidate>>> unambiguousCompositeGroups = new TreeMap<>();
        for (Map.Entry<String, List<RawCandidate>> entry : byCanonicalLink.entrySet()) {
            TreeSet<String> composites = new TreeSet<>();
            entry.getValue().stream()
                .map(RawCandidate::compositeIdentity)
                .filter(value -> value != null)
                .forEach(composites::add);
            if (composites.size() == 1) {
                unambiguousCompositeGroups.computeIfAbsent(
                    composites.first(),
                    ignored -> new ArrayList<>()
                ).add(entry.getValue());
            } else {
                clusters.add(new CandidateCluster(
                    entry.getValue(),
                    "link|" + entry.getKey()
                ));
            }
        }

        for (Map.Entry<String, List<List<RawCandidate>>> entry
            : unambiguousCompositeGroups.entrySet()) {
            List<List<RawCandidate>> linkGroups = entry.getValue();
            if (linkGroups.size() == 1) {
                List<RawCandidate> group = linkGroups.get(0);
                clusters.add(new CandidateCluster(
                    group,
                    "link|" + group.get(0).canonicalLink()
                ));
            } else {
                List<RawCandidate> combined = linkGroups.stream()
                    .flatMap(List::stream)
                    .sorted(RawCandidate.STABLE_ORDER)
                    .toList();
                clusters.add(new CandidateCluster(
                    combined,
                    "composite|" + entry.getKey()
                ));
            }
        }

        List<NormalizedCandidate> candidates = clusters.stream()
            .map(cluster -> merge(cluster.candidates(), cluster.identity()))
            .sorted(Comparator.comparing(NormalizedCandidate::candidateKey))
            .toList();
        rejectionCounts.put(
            CandidateRejectionReason.DUPLICATE,
            normalized.size() - candidates.size()
        );
        return new CandidateNormalizationResult(
            candidates,
            new CandidateFunnel(items.size(), candidates.size(), rejectionCounts)
        );
    }

    public List<CandidateEvidence> normalizeEvidence(
        NormalizedCandidate candidate,
        List<BlogSearchItem> source
    ) {
        String candidateName = SearchTextNormalizer.comparison(candidate.name());
        Map<String, CandidateEvidence> byCanonicalLink = new LinkedHashMap<>();
        source.stream()
            .map(this::normalizeEvidence)
            .flatMap(Optional::stream)
            .filter(value -> (value.normalizedTitle() + " " + value.normalizedSummary())
                .contains(candidateName))
            .sorted(Comparator.comparing(RawEvidence::canonicalLink)
                .thenComparingInt(value -> value.sourceUrl().length())
                .thenComparing(RawEvidence::sourceUrl)
                .thenComparing(RawEvidence::title)
                .thenComparing(RawEvidence::summary))
            .forEach(value -> byCanonicalLink.putIfAbsent(
                value.canonicalLink(),
                new CandidateEvidence(
                    "e-" + CandidateKey.fromIdentity("blog|" + value.canonicalLink()).value()
                        .substring(0, 16),
                    value.title(),
                    value.summary(),
                    value.sourceUrl()
                )
            ));
        return byCanonicalLink.values().stream().limit(3).toList();
    }

    private Optional<RawCandidate> normalize(PlaceSearchItem item) {
        String name = SearchTextNormalizer.display(item.name());
        Optional<String> canonicalLink = CanonicalHttpUrl.from(item.link());
        if (name.isBlank() || canonicalLink.isEmpty()) {
            return Optional.empty();
        }
        String category = SearchTextNormalizer.display(item.category());
        String description = SearchTextNormalizer.display(item.description());
        String address = SearchTextNormalizer.display(item.address());
        String roadAddress = SearchTextNormalizer.display(item.roadAddress());
        String comparisonAddress = SearchTextNormalizer.comparison(
            roadAddress.isBlank() ? address : roadAddress
        );
        String composite = comparisonAddress.isBlank()
            ? null
            : SearchTextNormalizer.comparison(name) + "|" + comparisonAddress;
        String searchable = SearchTextNormalizer.comparison(String.join(
            " ", name, category, description, address, roadAddress
        ));
        return Optional.of(new RawCandidate(
            name,
            category,
            description,
            address,
            roadAddress,
            item.link().trim(),
            canonicalLink.orElseThrow(),
            composite,
            searchable
        ));
    }

    private Optional<RawEvidence> normalizeEvidence(BlogSearchItem item) {
        Optional<String> canonicalLink = CanonicalHttpUrl.from(item.link());
        if (canonicalLink.isEmpty()) {
            return Optional.empty();
        }
        String title = SearchTextNormalizer.display(item.title());
        String summary = SearchTextNormalizer.display(item.summary());
        return Optional.of(new RawEvidence(
            title,
            summary,
            item.link().trim(),
            canonicalLink.orElseThrow(),
            SearchTextNormalizer.comparison(title),
            SearchTextNormalizer.comparison(summary)
        ));
    }

    private boolean doesNotContainExclusion(
        RawCandidate candidate,
        ConfirmedRecommendationCondition condition
    ) {
        return condition.exclusions().stream()
            .map(SearchTextNormalizer::comparison)
            .filter(value -> !value.isBlank())
            .noneMatch(candidate.searchableText()::contains);
    }

    private static EnumMap<CandidateRejectionReason, Integer> emptyRejectionCounts() {
        EnumMap<CandidateRejectionReason, Integer> counts =
            new EnumMap<>(CandidateRejectionReason.class);
        for (CandidateRejectionReason reason : CandidateRejectionReason.values()) {
            counts.put(reason, 0);
        }
        return counts;
    }

    private static void increment(
        EnumMap<CandidateRejectionReason, Integer> counts,
        CandidateRejectionReason reason
    ) {
        counts.compute(reason, (ignored, value) -> value == null ? 1 : value + 1);
    }

    private NormalizedCandidate merge(List<RawCandidate> cluster, String identity) {
        RawCandidate selected = cluster.stream().min(RawCandidate.BEST_DISPLAY).orElseThrow();
        TreeSet<String> searchableValues = new TreeSet<>();
        cluster.stream().map(RawCandidate::searchableText).forEach(searchableValues::add);
        String searchable = String.join(" ", searchableValues);
        return new NormalizedCandidate(
            CandidateKey.fromIdentity(identity),
            selected.name(),
            selected.category(),
            selected.description(),
            selected.address(),
            selected.roadAddress(),
            selected.sourceUrl(),
            searchable
        );
    }

    private record RawCandidate(
        String name,
        String category,
        String description,
        String address,
        String roadAddress,
        String sourceUrl,
        String canonicalLink,
        String compositeIdentity,
        String searchableText
    ) {
        private static final Comparator<RawCandidate> STABLE_ORDER = Comparator
            .comparing(RawCandidate::canonicalLink)
            .thenComparing(value -> value.compositeIdentity == null ? "" : value.compositeIdentity)
            .thenComparing(RawCandidate::name)
            .thenComparing(RawCandidate::roadAddress)
            .thenComparing(RawCandidate::address)
            .thenComparingInt(value -> value.sourceUrl.length())
            .thenComparing(RawCandidate::sourceUrl);

        private static final Comparator<RawCandidate> BEST_DISPLAY = Comparator
            .comparingInt(RawCandidate::completeness).reversed()
            .thenComparing(STABLE_ORDER);

        private int completeness() {
            int value = 0;
            value += category.isBlank() ? 0 : 1;
            value += description.isBlank() ? 0 : 1;
            value += address.isBlank() ? 0 : 1;
            value += roadAddress.isBlank() ? 0 : 1;
            return value;
        }
    }

    private record RawEvidence(
        String title,
        String summary,
        String sourceUrl,
        String canonicalLink,
        String normalizedTitle,
        String normalizedSummary
    ) {
    }

    private record CandidateCluster(List<RawCandidate> candidates, String identity) {
    }
}
