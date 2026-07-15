package com.placepick.draft;

import com.placepick.recommendation.condition.domain.ConfirmedRecommendationCondition;
import com.placepick.recommendation.condition.domain.PlaceType;
import com.placepick.recommendation.condition.domain.Preference;
import com.placepick.recommendation.job.infrastructure.PlacePickRoleCondition;
import com.placepick.session.AuthenticatedSession;
import com.placepick.session.SessionAuthenticator;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.net.URI;
import java.util.List;
import java.util.UUID;
import org.springframework.context.annotation.Conditional;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Conditional(PlacePickRoleCondition.Api.class)
@RequestMapping("/api/v1/recommendation-drafts")
public final class RecommendationDraftController {

    private final SessionAuthenticator authenticator;
    private final RecommendationDraftService draftService;

    public RecommendationDraftController(
        SessionAuthenticator authenticator,
        RecommendationDraftService draftService
    ) {
        this.authenticator = authenticator;
        this.draftService = draftService;
    }

    @PostMapping
    public ResponseEntity<DraftView> create(
        @Valid @RequestBody CreateDraftRequest body,
        HttpServletRequest request
    ) {
        AuthenticatedSession session = authenticator.require(request, true);
        DraftView draft = draftService.create(session.id(), body.requestText());
        return ResponseEntity.created(URI.create(
                "/api/v1/recommendation-drafts/" + draft.draftId()
            ))
            .cacheControl(CacheControl.noStore())
            .body(draft);
    }

    @GetMapping("/{draftId}")
    public ResponseEntity<DraftView> get(
        @PathVariable UUID draftId,
        HttpServletRequest request
    ) {
        AuthenticatedSession session = authenticator.require(request, false);
        return ResponseEntity.ok()
            .cacheControl(CacheControl.noStore())
            .body(draftService.get(draftId, session.id()));
    }

    @PutMapping("/{draftId}")
    public ResponseEntity<DraftView> confirm(
        @PathVariable UUID draftId,
        @Valid @RequestBody ConfirmDraftRequest body,
        HttpServletRequest request
    ) {
        AuthenticatedSession session = authenticator.require(request, true);
        return ResponseEntity.status(HttpStatus.OK)
            .cacheControl(CacheControl.noStore())
            .body(draftService.confirm(draftId, session.id(), body.condition().toDomain()));
    }

    public record CreateDraftRequest(
        @NotBlank(message = "requestText must not be blank")
        @Size(max = 1_000, message = "requestText must not exceed 1000 characters")
        String requestText
    ) {
    }

    public record ConfirmDraftRequest(@NotNull @Valid ConditionRequest condition) {
    }

    public record ConditionRequest(
        @NotBlank @Size(max = 100) String locationQuery,
        @NotNull PlaceType placeType,
        @Size(max = 30) String placeTypeDetail,
        @Min(1) @Max(100) Integer partySize,
        @Min(0) @Max(10_000_000) Integer budgetPerPersonMin,
        @Min(0) @Max(10_000_000) Integer budgetPerPersonMax,
        @NotNull @Size(max = 10) List<@Valid PreferenceRequest> preferences,
        @NotNull @Size(max = 10) List<@NotBlank @Size(max = 50) String> exclusions
    ) {
        ConfirmedRecommendationCondition toDomain() {
            return new ConfirmedRecommendationCondition(
                locationQuery,
                placeType,
                placeTypeDetail,
                partySize,
                budgetPerPersonMin,
                budgetPerPersonMax,
                preferences.stream().map(PreferenceRequest::toDomain).toList(),
                exclusions
            );
        }
    }

    public record PreferenceRequest(
        @NotBlank @Size(max = 50) String value,
        @NotNull @Min(1) @Max(10) Integer priority
    ) {
        Preference toDomain() {
            return new Preference(value, priority);
        }
    }
}
