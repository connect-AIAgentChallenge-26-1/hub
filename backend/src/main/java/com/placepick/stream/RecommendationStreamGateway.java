package com.placepick.stream;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.placepick.outbox.OutboxEvent;
import com.placepick.outbox.RecommendationRequestedEnvelope;
import com.placepick.infrastructure.observability.PlacePickMetrics;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;
import org.springframework.dao.DataAccessException;
import org.springframework.data.domain.Range;
import org.springframework.data.redis.connection.stream.Consumer;
import org.springframework.data.redis.connection.stream.MapRecord;
import org.springframework.data.redis.connection.stream.ReadOffset;
import org.springframework.data.redis.connection.stream.RecordId;
import org.springframework.data.redis.connection.stream.StreamOffset;
import org.springframework.data.redis.connection.stream.StreamReadOptions;
import org.springframework.data.redis.core.StreamOperations;
import org.springframework.data.redis.core.StringRedisTemplate;

/** Typed Redis Streams boundary for recommendation work, retry, pending claim, and DLQ. */
public class RecommendationStreamGateway {

    public static final String STREAM = "placepick:recommendation:requested";
    public static final String GROUP = "placepick-recommendation-workers";
    public static final String DLQ = "placepick:recommendation:dlq";

    private static final String EVENT_JSON = "eventJson";
    private static final String ATTEMPT = "attempt";

    private final StringRedisTemplate redisTemplate;
    private final ObjectMapper objectMapper;
    private final AtomicBoolean groupReady = new AtomicBoolean();
    private final PlacePickMetrics metrics;

    public RecommendationStreamGateway(
        StringRedisTemplate redisTemplate,
        ObjectMapper objectMapper
    ) {
        this(redisTemplate, objectMapper, null);
    }

    public RecommendationStreamGateway(
        StringRedisTemplate redisTemplate,
        ObjectMapper objectMapper,
        PlacePickMetrics metrics
    ) {
        this.redisTemplate = redisTemplate;
        this.objectMapper = objectMapper;
        this.metrics = metrics;
    }

    public String publish(OutboxEvent event) {
        return add(STREAM, event.payloadJson(), 0).getValue();
    }

    @SuppressWarnings("unchecked")
    public List<RecommendationStreamRecord> readNew(
        String consumerName,
        int count,
        Duration block
    ) {
        ensureGroup();
        List<MapRecord<String, Object, Object>> records = operations().read(
            Consumer.from(GROUP, consumerName),
            StreamReadOptions.empty().count(count).block(block),
            StreamOffset.create(STREAM, ReadOffset.lastConsumed())
        );
        return decode(records, consumerName);
    }

    public List<RecommendationStreamRecord> claimStale(
        String consumerName,
        int count,
        Duration minimumIdle
    ) {
        ensureGroup();
        var pending = operations().pending(STREAM, GROUP, Range.unbounded(), count);
        List<RecordId> stale = new ArrayList<>();
        pending.forEach(message -> {
            if (message.getElapsedTimeSinceLastDelivery().compareTo(minimumIdle) >= 0) {
                stale.add(message.getId());
            }
        });
        if (stale.isEmpty()) {
            return List.of();
        }
        return decode(
            operations().claim(
                STREAM,
                GROUP,
                consumerName,
                minimumIdle,
                stale.toArray(RecordId[]::new)
            ),
            consumerName
        );
    }

    public void acknowledge(String recordId) {
        operations().acknowledge(STREAM, GROUP, recordId);
    }

    public String retry(RecommendationStreamRecord record) {
        return add(STREAM, writeJson(record.envelope()), record.attempt() + 1).getValue();
    }

    public String deadLetter(RecommendationStreamRecord record, String safeFailureCode) {
        Map<String, String> values = Map.of(
            EVENT_JSON, writeJson(record.envelope()),
            ATTEMPT, Integer.toString(record.attempt()),
            "originalRecordId", record.recordId(),
            "failureCode", safeFailureCode
        );
        RecordId id = operations().add(MapRecord.create(DLQ, values));
        if (id == null) {
            throw new IllegalStateException("Redis did not return a DLQ record ID.");
        }
        if (metrics != null) {
            metrics.deadLetter("retry_exhausted");
        }
        return id.getValue();
    }

    public void ensureGroup() {
        if (groupReady.get()) {
            return;
        }
        synchronized (groupReady) {
            if (groupReady.get()) {
                return;
            }
            operations().add(MapRecord.create(STREAM, Map.of("_bootstrap", "1")));
            try {
                operations().createGroup(STREAM, ReadOffset.from("0-0"), GROUP);
            } catch (DataAccessException exception) {
                if (!isBusyGroup(exception)) {
                    throw exception;
                }
            }
            groupReady.set(true);
        }
    }

    private RecordId add(String stream, String eventJson, int attempt) {
        RecordId id = operations().add(MapRecord.create(stream, Map.of(
            EVENT_JSON, eventJson,
            ATTEMPT, Integer.toString(attempt)
        )));
        if (id == null) {
            throw new IllegalStateException("Redis did not return a stream record ID.");
        }
        return id;
    }

    private List<RecommendationStreamRecord> decode(
        List<MapRecord<String, Object, Object>> records,
        String consumerName
    ) {
        if (records == null || records.isEmpty()) {
            return List.of();
        }
        List<RecommendationStreamRecord> decoded = new ArrayList<>();
        for (MapRecord<String, Object, Object> record : records) {
            Object eventJson = record.getValue().get(EVENT_JSON);
            if (eventJson == null) {
                acknowledge(record.getId().getValue());
                continue;
            }
            try {
                int attempt = Integer.parseInt(String.valueOf(
                    record.getValue().getOrDefault(ATTEMPT, "0")
                ));
                RecommendationRequestedEnvelope envelope = objectMapper.readValue(
                    String.valueOf(eventJson),
                    RecommendationRequestedEnvelope.class
                );
                decoded.add(new RecommendationStreamRecord(
                    record.getId().getValue(),
                    envelope,
                    attempt
                ));
            } catch (JsonProcessingException | IllegalArgumentException exception) {
                Map<String, String> invalid = Map.of(
                    "originalRecordId", record.getId().getValue(),
                    "failureCode", "INVALID_EVENT_ENVELOPE",
                    "consumer", consumerName
                );
                operations().add(MapRecord.create(DLQ, invalid));
                if (metrics != null) {
                    metrics.deadLetter("invalid_envelope");
                }
                acknowledge(record.getId().getValue());
            }
        }
        return List.copyOf(decoded);
    }

    private StreamOperations<String, Object, Object> operations() {
        return redisTemplate.opsForStream();
    }

    private String writeJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Stream event JSON could not be encoded.", exception);
        }
    }

    private static boolean isBusyGroup(DataAccessException exception) {
        Throwable current = exception;
        while (current != null) {
            if (current.getMessage() != null && current.getMessage().contains("BUSYGROUP")) {
                return true;
            }
            current = current.getCause();
        }
        return false;
    }
}
