package com.placepick.analytics;

import java.time.Instant;

public interface ProductEventRepository {

    boolean insertIfAbsent(ProductEvent event);

    int deleteExpired(Instant now);
}
