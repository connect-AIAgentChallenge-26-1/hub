package com.placepick.recommendation.reason.application;

import com.placepick.recommendation.application.scoring.CandidateRankingResult;
import com.placepick.recommendation.application.trace.RecommendationTraceSink;
import com.placepick.recommendation.condition.domain.ConfirmedRecommendationCondition;
import com.placepick.recommendation.domain.scoring.RankedPlace;
import com.placepick.recommendation.domain.scoring.RecommendationWarning;
import com.placepick.recommendation.reason.application.port.out.GroundedReasonGenerationPort;
import com.placepick.recommendation.reason.application.port.out.ReasonGenerationCommand;
import com.placepick.recommendation.reason.application.port.out.ReasonGenerationOutcome;
import com.placepick.recommendation.reason.domain.PlaceReasonStatements;
import com.placepick.recommendation.reason.domain.ReasonPlaceContext;
import com.placepick.recommendation.reason.domain.ReasonStatement;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

public final class GroundedReasonService {

    public static final String BUDGET_CAUTION =
        "가격 정보는 검색 근거에서 확인되지 않았습니다.";
    public static final String BLOG_CAUTION =
        "블로그 근거를 확인하지 못했습니다.";
    public static final String FALLBACK_CAUTION =
        "추천 이유는 검증된 서버 템플릿으로 대체되었습니다.";

    private final GroundedReasonGenerationPort generationPort;
    private final ReasonContextFactory contextFactory;
    private final ReasonBatchValidator validator;
    private final RecommendationTraceSink traceSink;

    public GroundedReasonService(GroundedReasonGenerationPort generationPort) {
        this(generationPort, RecommendationTraceSink.none());
    }

    public GroundedReasonService(
        GroundedReasonGenerationPort generationPort,
        RecommendationTraceSink traceSink
    ) {
        this.generationPort = Objects.requireNonNull(generationPort, "generationPort");
        this.contextFactory = new ReasonContextFactory();
        this.validator = new ReasonBatchValidator(new ReasonStatementPolicy());
        this.traceSink = Objects.requireNonNull(traceSink, "traceSink");
    }

    public ReasonEnrichmentResult enrich(
        ConfirmedRecommendationCondition condition,
        CandidateRankingResult ranking
    ) {
        Objects.requireNonNull(condition, "condition");
        Objects.requireNonNull(ranking, "ranking");
        List<ReasonPlaceContext> contexts = ranking.places().stream()
            .map(contextFactory::create)
            .toList();
        ReasonGenerationCommand command = new ReasonGenerationCommand(condition, contexts);
        traceSink.reasonGenerationRequested(command);

        try {
            ReasonGenerationOutcome outcome = generationPort.generate(command);
            if (outcome == null || !outcome.generated()) {
                traceSink.reasonGenerationCompleted(outcome, true);
                return fallback(ranking, contexts);
            }
            List<PlaceReasonStatements> ordered = validator.validateAndOrder(
                command,
                outcome.batch()
            );
            ReasonEnrichmentResult result = new ReasonEnrichmentResult(
                assemble(ranking, ordered, false),
                false
            );
            traceSink.reasonGenerationCompleted(outcome, false);
            return result;
        } catch (RuntimeException exception) {
            traceSink.reasonGenerationCompleted(null, true);
            return fallback(ranking, contexts);
        }
    }

    private ReasonEnrichmentResult fallback(
        CandidateRankingResult ranking,
        List<ReasonPlaceContext> contexts
    ) {
        List<PlaceReasonStatements> statements = new ArrayList<>();
        for (int index = 0; index < ranking.places().size(); index++) {
            RankedPlace place = ranking.places().get(index);
            ReasonPlaceContext context = contexts.get(index);
            String category = place.candidate().category().isBlank()
                ? "장소"
                : place.candidate().category();
            String text = bounded(
                "검색 후보: " + place.candidate().name() + " / 유형: " + category,
                160
            );
            statements.add(new PlaceReasonStatements(
                place.placeId(),
                List.of(new ReasonStatement(
                    text,
                    List.of(context.evidence().get(0).evidenceId())
                ))
            ));
        }
        return new ReasonEnrichmentResult(assemble(ranking, statements, true), true);
    }

    private List<EnrichedPlaceReason> assemble(
        CandidateRankingResult ranking,
        List<PlaceReasonStatements> statements,
        boolean fallback
    ) {
        List<EnrichedPlaceReason> result = new ArrayList<>();
        for (int index = 0; index < ranking.places().size(); index++) {
            RankedPlace place = ranking.places().get(index);
            PlaceReasonStatements generated = statements.get(index);
            List<String> cautions = new ArrayList<>();
            if (ranking.warnings().contains(RecommendationWarning.BUDGET_EVIDENCE_UNAVAILABLE)) {
                cautions.add(BUDGET_CAUTION);
            }
            if (place.evidence().isEmpty()) {
                cautions.add(BLOG_CAUTION);
            }
            if (fallback) {
                cautions.add(FALLBACK_CAUTION);
            }
            String shareText = bounded(
                "추천 후보: " + place.candidate().name() + " — " +
                    generated.statements().get(0).text(),
                240
            );
            result.add(new EnrichedPlaceReason(
                place.placeId(),
                generated.statements(),
                cautions,
                shareText
            ));
        }
        return List.copyOf(result);
    }

    private static String bounded(String source, int maximum) {
        int length = source.codePointCount(0, source.length());
        return length <= maximum
            ? source
            : source.substring(0, source.offsetByCodePoints(0, maximum));
    }
}
