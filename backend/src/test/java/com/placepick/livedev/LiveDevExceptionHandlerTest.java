package com.placepick.livedev;

import static org.assertj.core.api.Assertions.assertThat;

import com.placepick.web.TraceIdFilter;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockHttpServletRequest;

class LiveDevExceptionHandlerTest {

    @Test
    void returnsOnlyClosedDiagnosticsAndTheRequestTraceId() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setAttribute(TraceIdFilter.REQUEST_ATTRIBUTE, "safe-trace-id");
        LiveDevWorkflowException failure = new LiveDevWorkflowException(
            HttpStatus.BAD_GATEWAY,
            "CONDITION_PROVIDER_INVALID_RESPONSE",
            "CONDITION_BUDGET_ORDER_INVALID",
            "조건 추출 Provider 응답을 처리하지 못했습니다."
        );

        var response = new LiveDevExceptionHandler().workflowFailure(failure, request);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_GATEWAY);
        assertThat(response.getBody().getProperties())
            .containsEntry("errorCode", "CONDITION_PROVIDER_INVALID_RESPONSE")
            .containsEntry("diagnosticCode", "CONDITION_BUDGET_ORDER_INVALID")
            .containsEntry("traceId", "safe-trace-id");
    }
}
