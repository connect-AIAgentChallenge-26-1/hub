package com.placepick.draft;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.placepick.recommendation.condition.application.port.out.ConditionExtractionPort;
import com.placepick.recommendation.condition.application.port.out.ConditionWarning;
import com.placepick.recommendation.condition.application.port.out.ExtractionOutcome;
import com.placepick.recommendation.condition.domain.ConfirmedRecommendationCondition;
import com.placepick.recommendation.condition.domain.DraftRecommendationCondition;
import com.placepick.recommendation.condition.domain.PlaceType;
import com.placepick.recommendation.condition.domain.Preference;
import com.placepick.session.SessionTokenCodec;
import com.placepick.web.ApiErrorCode;
import com.placepick.web.ApiException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

class RecommendationDraftServiceTest {

    private static final Instant NOW = Instant.parse("2026-07-16T00:00:00Z");
    private static final UUID OWNER = UUID.fromString("10000000-0000-4000-8000-000000000001");
    private static final DraftRecommendationCondition EXTRACTED =
        new DraftRecommendationCondition(
            "서울",
            PlaceType.CAFE,
            null,
            null,
            null,
            null,
            List.of(new Preference("조용한", 5)),
            List.of("흡연")
        );

    private final InMemoryRepository repository = new InMemoryRepository();
    private final SessionTokenCodec tokenCodec = new SessionTokenCodec();

    @Test
    void createsThirtyMinuteVersionFourDraftAfterExtraction() {
        RecommendationDraftService service = service(command -> ExtractionOutcome.extracted(
            EXTRACTED,
            List.of(ConditionWarning.PARTY_SIZE_NOT_PROVIDED)
        ));

        DraftView result = service.create(OWNER, "  서울에서 조용한 카페  ");
        RecommendationDraft stored = repository.drafts.get(result.draftId());

        assertThat(result.draftId().version()).isEqualTo(4);
        assertThat(result.status()).isEqualTo(DraftStatus.EXTRACTED);
        assertThat(result.expiresAt()).isEqualTo(NOW.plus(Duration.ofMinutes(30)));
        assertThat(stored.requestText()).isEqualTo("서울에서 조용한 카페");
        assertThat(stored.toString()).doesNotContain(stored.requestText());
    }

    @Test
    void rejectsUnprocessableExtractionWithoutPersistingDraft() {
        RecommendationDraftService service = service(command ->
            ExtractionOutcome.unprocessable(List.of())
        );

        assertThatThrownBy(() -> service.create(OWNER, "조건 없음"))
            .isInstanceOfSatisfying(ApiException.class, exception -> {
                assertThat(exception.status()).isEqualTo(HttpStatus.UNPROCESSABLE_ENTITY);
                assertThat(exception.errorCode()).isEqualTo(ApiErrorCode.UNPROCESSABLE_CONDITION);
            });
        assertThat(repository.drafts).isEmpty();
    }

    @Test
    void hidesAnotherSessionsDraftAndDistinguishesOwnedExpiry() {
        RecommendationDraft draft = draft(OWNER, NOW.plusSeconds(1));
        repository.insert(draft);
        RecommendationDraftService service = service(command ->
            ExtractionOutcome.extracted(EXTRACTED, List.of())
        );

        assertThatThrownBy(() -> service.get(draft.id(), UUID.randomUUID()))
            .isInstanceOfSatisfying(ApiException.class, exception -> {
                assertThat(exception.status()).isEqualTo(HttpStatus.NOT_FOUND);
                assertThat(exception.errorCode()).isEqualTo(ApiErrorCode.RESOURCE_NOT_FOUND);
            });

        RecommendationDraftService expiredService = new RecommendationDraftService(
            repository,
            command -> ExtractionOutcome.extracted(EXTRACTED, List.of()),
            tokenCodec,
            Clock.fixed(NOW.plusSeconds(2), ZoneOffset.UTC),
            Duration.ofMinutes(30)
        );
        assertThatThrownBy(() -> expiredService.get(draft.id(), OWNER))
            .isInstanceOfSatisfying(ApiException.class, exception -> {
                assertThat(exception.status()).isEqualTo(HttpStatus.GONE);
                assertThat(exception.errorCode()).isEqualTo(ApiErrorCode.DRAFT_EXPIRED);
            });
    }

    @Test
    void confirmsAFullReplacementWithoutChangingOriginalExpiry() {
        RecommendationDraft draft = draft(OWNER, NOW.plus(Duration.ofMinutes(30)));
        repository.insert(draft);
        RecommendationDraftService service = service(command ->
            ExtractionOutcome.extracted(EXTRACTED, List.of())
        );
        ConfirmedRecommendationCondition confirmed = new ConfirmedRecommendationCondition(
            "서울 강남",
            PlaceType.RESTAURANT,
            null,
            4,
            10_000,
            30_000,
            List.of(new Preference("룸", 8)),
            List.of("흡연")
        );

        DraftView result = service.confirm(draft.id(), OWNER, confirmed);

        assertThat(result.status()).isEqualTo(DraftStatus.CONFIRMED);
        assertThat(result.extractedCondition().locationQuery()).isEqualTo("서울 강남");
        assertThat(result.expiresAt()).isEqualTo(draft.expiresAt());
    }

    private RecommendationDraftService service(ConditionExtractionPort extractionPort) {
        return new RecommendationDraftService(
            repository,
            extractionPort,
            tokenCodec,
            Clock.fixed(NOW, ZoneOffset.UTC),
            Duration.ofMinutes(30)
        );
    }

    private RecommendationDraft draft(UUID owner, Instant expiresAt) {
        UUID id = UUID.randomUUID();
        return new RecommendationDraft(
            id,
            owner,
            DraftStatus.EXTRACTED,
            "<redacted-input>",
            EXTRACTED,
            List.of(),
            null,
            NOW,
            NOW,
            expiresAt
        );
    }

    private static final class InMemoryRepository implements RecommendationDraftRepository {
        private final Map<UUID, RecommendationDraft> drafts = new HashMap<>();

        @Override
        public void insert(RecommendationDraft draft) {
            drafts.put(draft.id(), draft);
        }

        @Override
        public Optional<RecommendationDraft> findOwned(UUID draftId, UUID sessionId) {
            return Optional.ofNullable(drafts.get(draftId))
                .filter(draft -> draft.sessionId().equals(sessionId));
        }

        @Override
        public Optional<RecommendationDraft> findOwnedForUpdate(UUID draftId, UUID sessionId) {
            return findOwned(draftId, sessionId);
        }

        @Override
        public boolean confirm(
            UUID draftId,
            UUID sessionId,
            DraftRecommendationCondition condition,
            Instant updatedAt
        ) {
            Optional<RecommendationDraft> found = findOwned(draftId, sessionId);
            if (found.isEmpty() || found.orElseThrow().status() == DraftStatus.CONSUMED) {
                return false;
            }
            RecommendationDraft current = found.orElseThrow();
            drafts.put(draftId, new RecommendationDraft(
                current.id(),
                current.sessionId(),
                DraftStatus.CONFIRMED,
                current.requestText(),
                condition,
                current.warnings(),
                current.consumedJobId(),
                current.createdAt(),
                updatedAt,
                current.expiresAt()
            ));
            return true;
        }

        @Override
        public boolean consume(
            UUID draftId,
            UUID sessionId,
            UUID jobId,
            Instant updatedAt
        ) {
            Optional<RecommendationDraft> found = findOwned(draftId, sessionId);
            if (found.isEmpty() || found.orElseThrow().status() != DraftStatus.CONFIRMED) {
                return false;
            }
            RecommendationDraft current = found.orElseThrow();
            drafts.put(draftId, new RecommendationDraft(
                current.id(),
                current.sessionId(),
                DraftStatus.CONSUMED,
                current.requestText(),
                current.condition(),
                current.warnings(),
                jobId,
                current.createdAt(),
                updatedAt,
                current.expiresAt()
            ));
            return true;
        }
    }
}
