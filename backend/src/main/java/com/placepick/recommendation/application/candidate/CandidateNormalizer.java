package com.placepick.recommendation.application.candidate;

import com.placepick.recommendation.application.port.out.BlogSearchItem;
import com.placepick.recommendation.application.port.out.PlaceSearchItem;
import com.placepick.recommendation.application.port.out.PlaceSearchSort;
import com.placepick.recommendation.condition.domain.ConfirmedRecommendationCondition;
import com.placepick.recommendation.domain.candidate.CandidateEvidence;
import com.placepick.recommendation.domain.candidate.CandidateKey;
import com.placepick.recommendation.domain.candidate.NormalizedCandidate;
import java.math.BigDecimal;
import java.net.URI;
import java.net.URISyntaxException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
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
        List<PlaceSearchHit> hits = new ArrayList<>();
        for (int index = 0; index < source.size(); index++) {
            PlaceSearchItem item = source.get(index);
            String legacyId = "legacy." + CandidateKey.fromIdentity(String.join(
                "|",
                item.name(),
                item.link(),
                item.address(),
                item.roadAddress(),
                item.longitude(),
                item.latitude()
            )).value().substring(0, 16);
            hits.add(new PlaceSearchHit(
                item,
                new SearchObservation(
                    legacyId,
                    PlaceSearchSort.ACCURACY,
                    1,
                    1_000
                )
            ));
        }
        return normalizeSearchHitsWithFunnel(hits, condition);
    }

    public CandidateNormalizationResult normalizeSearchHitsWithFunnel(
        List<PlaceSearchHit> source,
        ConfirmedRecommendationCondition condition
    ) {
        List<PlaceSearchHit> hits = List.copyOf(source);
        EnumMap<CandidateRejectionReason, Integer> rejectionCounts = emptyRejectionCounts();
        List<RawCandidate> normalized = new ArrayList<>();
        for (PlaceSearchHit hit : hits) {
            Optional<RawCandidate> candidate = normalize(hit, condition);
            if (candidate.isEmpty()) {
                increment(rejectionCounts, CandidateRejectionReason.MISSING_IDENTITY);
                continue;
            }
            RawCandidate value = candidate.orElseThrow();
            if (!value.locationMatch().accepted()) {
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

        List<CandidateCluster> provisional = provisionalClusters(normalized);
        List<CandidateCluster> clusters = mergeSharedComposites(provisional);
        List<NormalizedCandidate> candidates = clusters.stream()
            .map(this::merge)
            .sorted(Comparator.comparing(NormalizedCandidate::candidateKey))
            .toList();
        rejectionCounts.put(
            CandidateRejectionReason.DUPLICATE,
            normalized.size() - candidates.size()
        );
        return new CandidateNormalizationResult(
            candidates,
            new CandidateFunnel(hits.size(), candidates.size(), rejectionCounts)
        );
    }

    public List<CandidateEvidence> normalizeEvidence(
        NormalizedCandidate candidate,
        List<BlogSearchItem> source
    ) {
        return normalizeEvidence(candidate, source, "");
    }

    public List<CandidateEvidence> normalizeEvidence(
        NormalizedCandidate candidate,
        List<BlogSearchItem> source,
        String requestedLocation
    ) {
        Map<String, RawEvidence> byCanonicalLink = new LinkedHashMap<>();
        source.stream()
            .map(this::normalizeEvidence)
            .flatMap(Optional::stream)
            .map(value -> value.withEntityConfidence(
                entityConfidence(candidate, value, requestedLocation)
            ))
            .filter(value -> value.entityConfidence() >= 90)
            .sorted(RawEvidence.BEST_ORDER)
            .forEach(value -> byCanonicalLink.putIfAbsent(value.canonicalLink(), value));

        List<CandidateEvidence> selected = new ArrayList<>();
        Set<String> authors = new HashSet<>();
        for (RawEvidence value : byCanonicalLink.values()) {
            String authorKey = authorKey(value);
            if (!authorKey.isBlank() && authors.contains(authorKey)) {
                continue;
            }
            selected.add(toEvidence(value));
            if (!authorKey.isBlank()) {
                authors.add(authorKey);
            }
            if (selected.size() == 3) {
                break;
            }
        }
        if (selected.size() < 3) {
            Set<String> selectedIds = selected.stream()
                .map(CandidateEvidence::evidenceId)
                .collect(java.util.stream.Collectors.toSet());
            for (RawEvidence value : byCanonicalLink.values()) {
                CandidateEvidence evidence = toEvidence(value);
                if (selectedIds.add(evidence.evidenceId())) {
                    selected.add(evidence);
                }
                if (selected.size() == 3) {
                    break;
                }
            }
        }
        return List.copyOf(selected);
    }

    private Optional<RawCandidate> normalize(
        PlaceSearchHit hit,
        ConfirmedRecommendationCondition condition
    ) {
        PlaceSearchItem item = hit.item();
        String name = SearchTextNormalizer.display(item.name());
        if (name.isBlank()) {
            return Optional.empty();
        }
        Optional<String> canonicalLink = CanonicalHttpUrl.from(item.link());
        String sourceUrl = canonicalLink.isPresent() ? item.link().trim() : null;
        String category = SearchTextNormalizer.display(item.category());
        String description = SearchTextNormalizer.display(item.description());
        String address = SearchTextNormalizer.display(item.address());
        String roadAddress = SearchTextNormalizer.display(item.roadAddress());
        String comparisonAddress = SearchTextNormalizer.comparison(
            roadAddress.isBlank() ? address : roadAddress
        );
        String longitude = coordinate(item.longitude());
        String latitude = coordinate(item.latitude());
        String coordinateIdentity = longitude.isBlank() || latitude.isBlank()
            ? null
            : longitude + "," + latitude;
        String branchIdentity = !comparisonAddress.isBlank()
            ? "address|" + comparisonAddress
            : coordinateIdentity == null ? null : "coordinate|" + coordinateIdentity;
        if (canonicalLink.isEmpty() && branchIdentity == null) {
            return Optional.empty();
        }
        String composite = branchIdentity == null
            ? null
            : SearchTextNormalizer.comparison(name) + "|" + branchIdentity;
        String searchable = SearchTextNormalizer.comparison(String.join(
            " ", name, category, description, address, roadAddress
        ));
        LocationMatch locationMatch = locationMatcher.resolve(
            condition.locationQuery(),
            address,
            roadAddress,
            true
        );
        return Optional.of(new RawCandidate(
            name,
            category,
            description,
            address,
            roadAddress,
            sourceUrl,
            canonicalLink.orElse(null),
            branchIdentity,
            composite,
            searchable,
            longitude,
            latitude,
            locationMatch,
            hit.observation()
        ));
    }

    private List<CandidateCluster> provisionalClusters(List<RawCandidate> source) {
        Map<String, List<RawCandidate>> groups = new TreeMap<>();
        for (RawCandidate candidate : source) {
            String key;
            if (candidate.canonicalLink() != null) {
                key = "link|" + candidate.canonicalLink() + "|" +
                    (candidate.branchIdentity() == null ? "unknown" : candidate.branchIdentity());
            } else {
                key = "composite|" + candidate.compositeIdentity();
            }
            groups.computeIfAbsent(key, ignored -> new ArrayList<>()).add(candidate);
        }
        return groups.entrySet().stream()
            .map(entry -> new CandidateCluster(entry.getValue(), entry.getKey()))
            .toList();
    }

    private List<CandidateCluster> mergeSharedComposites(List<CandidateCluster> provisional) {
        Map<String, List<CandidateCluster>> byComposite = new TreeMap<>();
        List<CandidateCluster> result = new ArrayList<>();
        for (CandidateCluster cluster : provisional) {
            TreeSet<String> composites = cluster.candidates().stream()
                .map(RawCandidate::compositeIdentity)
                .filter(value -> value != null)
                .collect(java.util.stream.Collectors.toCollection(TreeSet::new));
            if (composites.size() == 1) {
                byComposite.computeIfAbsent(composites.first(), ignored -> new ArrayList<>())
                    .add(cluster);
            } else {
                result.add(cluster);
            }
        }
        for (Map.Entry<String, List<CandidateCluster>> entry : byComposite.entrySet()) {
            List<RawCandidate> combined = entry.getValue().stream()
                .flatMap(value -> value.candidates().stream())
                .sorted(RawCandidate.STABLE_ORDER)
                .toList();
            result.add(new CandidateCluster(combined, "composite|" + entry.getKey()));
        }
        return result;
    }

    private NormalizedCandidate merge(CandidateCluster cluster) {
        RawCandidate selected = cluster.candidates().stream()
            .min(RawCandidate.BEST_DISPLAY)
            .orElseThrow();
        TreeSet<String> searchableValues = new TreeSet<>();
        cluster.candidates().stream().map(RawCandidate::searchableText)
            .forEach(searchableValues::add);
        Map<String, SearchObservation> observations = new TreeMap<>();
        cluster.candidates().stream().map(RawCandidate::observation).forEach(value ->
            observations.merge(
                value.variantId(),
                value,
                (first, second) -> first.providerRank() <= second.providerRank() ? first : second
            )
        );
        LocationConfidence confidence = cluster.candidates().stream()
            .map(value -> value.locationMatch().confidence())
            .max(Comparator.comparingInt(LocationConfidence::score))
            .orElseThrow();
        return new NormalizedCandidate(
            CandidateKey.fromIdentity(cluster.identity()),
            selected.name(),
            selected.category(),
            selected.description(),
            selected.address(),
            selected.roadAddress(),
            selected.sourceUrl(),
            String.join(" ", searchableValues),
            selected.longitude(),
            selected.latitude(),
            confidence,
            List.copyOf(observations.values())
        );
    }

    private Optional<RawEvidence> normalizeEvidence(BlogSearchItem item) {
        Optional<String> canonicalLink = CanonicalHttpUrl.from(item.link());
        if (canonicalLink.isEmpty()) {
            return Optional.empty();
        }
        String title = SearchTextNormalizer.display(item.title());
        String summary = SearchTextNormalizer.display(item.summary());
        if (title.isBlank() && summary.isBlank()) {
            return Optional.empty();
        }
        return Optional.of(new RawEvidence(
            title,
            summary,
            item.link().trim(),
            canonicalLink.orElseThrow(),
            SearchTextNormalizer.comparison(title),
            SearchTextNormalizer.comparison(summary),
            SearchTextNormalizer.display(item.authorName()),
            CanonicalHttpUrl.from(item.authorLink()).map(ignored -> item.authorLink().trim())
                .orElse(null),
            SearchTextNormalizer.display(item.publishedDate()),
            0
        ));
    }

    private int entityConfidence(
        NormalizedCandidate candidate,
        RawEvidence evidence,
        String requestedLocation
    ) {
        String content = evidence.normalizedTitle() + " " + evidence.normalizedSummary();
        String name = SearchTextNormalizer.comparison(candidate.name());
        if (name.isBlank() || !content.contains(name)) {
            return 0;
        }
        int score = 70;
        List<String> categoryTokens = List.of(
            SearchTextNormalizer.comparison(candidate.category()).split("[>\\s,/|]+")
        );
        if (categoryTokens.stream().filter(value -> value.length() > 1).anyMatch(content::contains)) {
            score += 10;
        }
        Set<String> locationTokens = locationTokens(
            candidate.roadAddress().isBlank() ? candidate.address() : candidate.roadAddress(),
            requestedLocation
        );
        if (locationTokens.stream().anyMatch(content::contains)) {
            score += 20;
        }
        return Math.min(100, score);
    }

    private Set<String> locationTokens(String... values) {
        Set<String> tokens = new HashSet<>();
        Set<String> generic = Set.of(
            "대한민국", "서울", "서울특별시", "부산", "부산광역시", "대구", "대구광역시",
            "인천", "인천광역시", "광주", "광주광역시", "대전", "대전광역시", "울산",
            "울산광역시", "세종", "세종특별자치시"
        );
        for (String value : values) {
            String[] split = SearchTextNormalizer.comparison(value).split("[^\\p{L}\\p{N}]+");
            for (String token : split) {
                if (token.length() < 2 || generic.contains(token)) {
                    continue;
                }
                tokens.add(token);
                String stem = token.replaceFirst("(특별자치시|특별자치도|광역시|특별시|시|군|구|읍|면|동|리)$", "");
                if (stem.length() >= 2) {
                    tokens.add(stem);
                }
            }
        }
        return Set.copyOf(tokens);
    }

    private CandidateEvidence toEvidence(RawEvidence value) {
        return new CandidateEvidence(
            "e-" + CandidateKey.fromIdentity("blog|" + value.canonicalLink()).value()
                .substring(0, 16),
            value.title(),
            value.summary(),
            value.sourceUrl(),
            value.authorName(),
            value.authorLink(),
            value.publishedDate(),
            value.entityConfidence()
        );
    }

    private String authorKey(RawEvidence evidence) {
        if (evidence.authorLink() != null) {
            return SearchTextNormalizer.comparison(evidence.authorLink());
        }
        if (!evidence.authorName().isBlank()) {
            return SearchTextNormalizer.comparison(evidence.authorName());
        }
        try {
            return new URI(evidence.sourceUrl()).getHost();
        } catch (URISyntaxException exception) {
            return "";
        }
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

    private static String coordinate(String value) {
        if (value == null || value.isBlank()) {
            return "";
        }
        try {
            return new BigDecimal(value.strip()).stripTrailingZeros().toPlainString();
        } catch (NumberFormatException exception) {
            return "";
        }
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

    private record RawCandidate(
        String name,
        String category,
        String description,
        String address,
        String roadAddress,
        String sourceUrl,
        String canonicalLink,
        String branchIdentity,
        String compositeIdentity,
        String searchableText,
        String longitude,
        String latitude,
        LocationMatch locationMatch,
        SearchObservation observation
    ) {
        private static final Comparator<RawCandidate> STABLE_ORDER = Comparator
            .comparing((RawCandidate value) ->
                value.canonicalLink() == null ? "" : value.canonicalLink())
            .thenComparing(value ->
                value.compositeIdentity() == null ? "" : value.compositeIdentity())
            .thenComparing(RawCandidate::name)
            .thenComparing(RawCandidate::roadAddress)
            .thenComparing(RawCandidate::address)
            .thenComparing(value -> value.sourceUrl() == null ? "" : value.sourceUrl())
            .thenComparing(value -> value.observation().variantId());

        private static final Comparator<RawCandidate> BEST_DISPLAY = Comparator
            .comparingInt(RawCandidate::completeness).reversed()
            .thenComparing(STABLE_ORDER);

        private int completeness() {
            int value = 0;
            value += category.isBlank() ? 0 : 1;
            value += description.isBlank() ? 0 : 1;
            value += address.isBlank() ? 0 : 1;
            value += roadAddress.isBlank() ? 0 : 1;
            value += sourceUrl == null ? 0 : 1;
            value += longitude.isBlank() || latitude.isBlank() ? 0 : 1;
            return value;
        }
    }

    private record RawEvidence(
        String title,
        String summary,
        String sourceUrl,
        String canonicalLink,
        String normalizedTitle,
        String normalizedSummary,
        String authorName,
        String authorLink,
        String publishedDate,
        int entityConfidence
    ) {
        private static final Comparator<RawEvidence> BEST_ORDER = Comparator
            .comparingInt(RawEvidence::entityConfidence).reversed()
            .thenComparing(RawEvidence::publishedDate, Comparator.reverseOrder())
            .thenComparing(RawEvidence::canonicalLink)
            .thenComparingInt(value -> value.sourceUrl().length())
            .thenComparing(RawEvidence::sourceUrl);

        private RawEvidence withEntityConfidence(int value) {
            return new RawEvidence(
                title,
                summary,
                sourceUrl,
                canonicalLink,
                normalizedTitle,
                normalizedSummary,
                authorName,
                authorLink,
                publishedDate,
                value
            );
        }
    }

    private record CandidateCluster(List<RawCandidate> candidates, String identity) {
    }
}
