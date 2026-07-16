package com.placepick.lifecycle;

import java.time.Instant;

public interface DataRetentionRepository {

    RetentionCleanupReport deleteExpired(
        Instant now,
        Instant processedBefore,
        Instant publishedOutboxBefore
    );
}
