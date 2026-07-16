package com.placepick.livedev;

import com.placepick.recommendation.application.port.out.BlogSearchItem;
import com.placepick.recommendation.application.port.out.PlaceSearchItem;
import com.placepick.recommendation.condition.domain.ConfirmedRecommendationCondition;
import com.placepick.recommendation.condition.domain.DraftRecommendationCondition;
import com.placepick.recommendation.condition.domain.Preference;
import com.placepick.recommendation.domain.candidate.CandidateEvidence;
import com.placepick.recommendation.domain.candidate.NormalizedCandidate;
import com.placepick.recommendation.domain.scoring.RankedPlace;
import com.placepick.recommendation.domain.scoring.ScoreBreakdown;
import com.placepick.recommendation.domain.scoring.ScoredCandidate;
import com.placepick.recommendation.reason.application.port.out.ReasonGenerationCommand;
import com.placepick.recommendation.reason.domain.PlaceReasonStatements;
import com.placepick.recommendation.reason.domain.ReasonEvidence;
import com.placepick.recommendation.reason.domain.ReasonPlaceContext;
import com.placepick.recommendation.reason.domain.ReasonStatement;
import com.placepick.recommendation.workflow.application.RecommendationCorePlace;
import com.placepick.recommendation.workflow.application.RecommendationCoreResult;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** JSON views used only by the local developer workflow surface. */
public final class LiveDevApiDto {

    private LiveDevApiDto() {
    }

    public record CreateDraftRequest(String requestText) {
    }

    public record ConfirmDraftRequest(ConfirmedRecommendationCondition condition) {
    }

    public record CreateRunRequest(UUID draftId) {
    }

    public record DraftView(
        UUID draftId,
        String status,
        ConditionView condition,
        List<String> warnings,
        Instant createdAt,
        Instant expiresAt
    ) {
        public DraftView {
            warnings = List.copyOf(warnings);
        }
    }

    public record RunView(
        UUID runId,
        UUID draftId,
        String status,
        List<TraceEventView> trace,
        ResultView result,
        FailureView failure,
        Instant createdAt,
        Instant updatedAt,
        Instant expiresAt
    ) {
        public RunView {
            trace = List.copyOf(trace);
        }
    }

    public record TraceEventView(
        long id,
        String stage,
        String status,
        Instant occurredAt,
        Map<String, Object> data
    ) {
        public TraceEventView {
            data = Map.copyOf(data);
        }
    }

    public record FailureView(String errorCode, String message) {
    }

    public record ConditionView(
        String locationQuery,
        String placeType,
        String placeTypeDetail,
        Integer partySize,
        Integer budgetPerPersonMin,
        Integer budgetPerPersonMax,
        List<PreferenceView> preferences,
        List<String> exclusions
    ) {
        public ConditionView {
            preferences = List.copyOf(preferences);
            exclusions = List.copyOf(exclusions);
        }

        static ConditionView from(DraftRecommendationCondition source) {
            return new ConditionView(
                source.locationQuery(),
                source.placeType() == null ? null : source.placeType().name(),
                source.placeTypeDetail(),
                source.partySize(),
                source.budgetPerPersonMin(),
                source.budgetPerPersonMax(),
                source.preferences().stream().map(PreferenceView::from).toList(),
                source.exclusions()
            );
        }

        static ConditionView from(ConfirmedRecommendationCondition source) {
            return new ConditionView(
                source.locationQuery(),
                source.placeType().name(),
                source.placeTypeDetail(),
                source.partySize(),
                source.budgetPerPersonMin(),
                source.budgetPerPersonMax(),
                source.preferences().stream().map(PreferenceView::from).toList(),
                source.exclusions()
            );
        }
    }

    public record PreferenceView(String value, Integer priority) {
        static PreferenceView from(Preference source) {
            return new PreferenceView(source.value(), source.priority());
        }
    }

    public record PlaceSearchItemView(
        String name,
        String link,
        String category,
        String description,
        String address,
        String roadAddress
    ) {
        static PlaceSearchItemView from(PlaceSearchItem source) {
            return new PlaceSearchItemView(
                source.name(),
                source.link(),
                source.category(),
                source.description(),
                source.address(),
                source.roadAddress()
            );
        }
    }

    public record BlogSearchItemView(String title, String link, String summary) {
        static BlogSearchItemView from(BlogSearchItem source) {
            return new BlogSearchItemView(source.title(), source.link(), source.summary());
        }
    }

    public record CandidateView(
        String name,
        String category,
        String description,
        String address,
        String roadAddress,
        String sourceUrl
    ) {
        static CandidateView from(NormalizedCandidate source) {
            return new CandidateView(
                source.name(),
                source.category(),
                source.description(),
                source.address(),
                source.roadAddress(),
                source.sourceUrl()
            );
        }
    }

    public record ScoreView(
        int location,
        int placeType,
        int budget,
        int preference,
        int blogEvidence,
        int total
    ) {
        static ScoreView from(ScoreBreakdown source) {
            return new ScoreView(
                source.location(),
                source.placeType(),
                source.budget(),
                source.preference(),
                source.blogEvidence(),
                source.total()
            );
        }
    }

    public record ScoredCandidateView(
        CandidateView candidate,
        ScoreView score,
        int evidenceCount
    ) {
        static ScoredCandidateView from(ScoredCandidate source) {
            return new ScoredCandidateView(
                CandidateView.from(source.candidate()),
                ScoreView.from(source.scoreBreakdown()),
                source.evidence().size()
            );
        }
    }

    public record EvidenceView(
        String evidenceId,
        String title,
        String summary,
        String sourceUrl
    ) {
        static EvidenceView from(CandidateEvidence source) {
            return new EvidenceView(
                source.evidenceId(),
                source.title(),
                source.summary(),
                source.sourceUrl()
            );
        }
    }

    public record RankedPlaceView(
        UUID placeId,
        CandidateView candidate,
        List<EvidenceView> evidence,
        ScoreView score
    ) {
        public RankedPlaceView {
            evidence = List.copyOf(evidence);
        }

        static RankedPlaceView from(RankedPlace source) {
            return new RankedPlaceView(
                source.placeId(),
                CandidateView.from(source.candidate()),
                source.evidence().stream().map(EvidenceView::from).toList(),
                ScoreView.from(source.scoreBreakdown())
            );
        }
    }

    public record ReasonEvidenceView(
        String evidenceId,
        String type,
        String title,
        String summary
    ) {
        static ReasonEvidenceView from(ReasonEvidence source) {
            return new ReasonEvidenceView(
                source.evidenceId(),
                source.type().name(),
                source.title(),
                source.summary()
            );
        }
    }

    public record ReasonPlaceView(
        UUID placeId,
        String name,
        String category,
        List<ReasonEvidenceView> evidence
    ) {
        public ReasonPlaceView {
            evidence = List.copyOf(evidence);
        }

        static ReasonPlaceView from(ReasonPlaceContext source) {
            return new ReasonPlaceView(
                source.placeId(),
                source.name(),
                source.category(),
                source.evidence().stream().map(ReasonEvidenceView::from).toList()
            );
        }
    }

    public record ReasonRequestView(
        ConditionView condition,
        List<ReasonPlaceView> places
    ) {
        public ReasonRequestView {
            places = List.copyOf(places);
        }

        static ReasonRequestView from(ReasonGenerationCommand source) {
            return new ReasonRequestView(
                ConditionView.from(source.condition()),
                source.places().stream().map(ReasonPlaceView::from).toList()
            );
        }
    }

    public record ReasonStatementView(String text, List<String> evidenceIds) {
        public ReasonStatementView {
            evidenceIds = List.copyOf(evidenceIds);
        }

        static ReasonStatementView from(ReasonStatement source) {
            return new ReasonStatementView(source.text(), source.evidenceIds());
        }
    }

    public record GeneratedReasonView(
        UUID placeId,
        List<ReasonStatementView> statements
    ) {
        public GeneratedReasonView {
            statements = List.copyOf(statements);
        }

        static GeneratedReasonView from(PlaceReasonStatements source) {
            return new GeneratedReasonView(
                source.placeId(),
                source.statements().stream().map(ReasonStatementView::from).toList()
            );
        }
    }

    public record ResultPlaceView(
        RankedPlaceView rankedPlace,
        List<ReasonStatementView> reasons,
        List<String> cautions,
        String shareText,
        String evidenceLevel
    ) {
        public ResultPlaceView {
            reasons = List.copyOf(reasons);
            cautions = List.copyOf(cautions);
        }

        static ResultPlaceView from(RecommendationCorePlace source) {
            return new ResultPlaceView(
                RankedPlaceView.from(source.rankedPlace()),
                source.reasonStatements().stream().map(ReasonStatementView::from).toList(),
                source.cautions(),
                source.shareText(),
                source.evidenceLevel().name()
            );
        }
    }

    public record ResultView(
        List<ResultPlaceView> places,
        boolean degraded,
        List<String> warnings,
        boolean reasonFallback,
        boolean relaxed,
        int placeSearchCalls,
        int blogSearchCalls,
        int reasonGenerationCalls
    ) {
        public ResultView {
            places = List.copyOf(places);
            warnings = List.copyOf(warnings);
        }

        static ResultView from(RecommendationCoreResult source) {
            return new ResultView(
                source.places().stream().map(ResultPlaceView::from).toList(),
                source.degraded(),
                source.warnings(),
                source.reasonFallback(),
                source.relaxed(),
                source.placeSearchCalls(),
                source.blogSearchCalls(),
                source.reasonGenerationCalls()
            );
        }
    }
}
