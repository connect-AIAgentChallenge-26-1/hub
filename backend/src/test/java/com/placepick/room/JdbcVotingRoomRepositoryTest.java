package com.placepick.room;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.placepick.infrastructure.observability.PlacePickMetrics;
import java.time.Duration;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.simple.JdbcClient;

class JdbcVotingRoomRepositoryTest {

    @Test
    void requiresAPositiveContentionThreshold() {
        JdbcClient jdbcClient = mock(JdbcClient.class);
        PlacePickMetrics metrics = mock(PlacePickMetrics.class);

        assertThatCode(() -> new JdbcVotingRoomRepository(
            jdbcClient,
            new ObjectMapper(),
            metrics,
            Duration.ofMillis(100)
        )).doesNotThrowAnyException();
        assertThatThrownBy(() -> new JdbcVotingRoomRepository(
            jdbcClient,
            new ObjectMapper(),
            metrics,
            Duration.ZERO
        )).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new JdbcVotingRoomRepository(
            jdbcClient,
            new ObjectMapper(),
            metrics,
            Duration.ofMillis(-1)
        )).isInstanceOf(IllegalArgumentException.class);
    }
}
