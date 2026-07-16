FROM eclipse-temurin:17-jdk-jammy@sha256:723151f3fc88ca2060153ee08ab8dbbea7983d6ed6f2622fe440acf178737c94 AS build

WORKDIR /workspace

COPY gradle gradle
COPY gradlew gradlew
COPY settings.gradle build.gradle gradle.properties ./
COPY backend/build.gradle backend/build.gradle
COPY backend/gradle.lockfile backend/gradle.lockfile
COPY backend/src backend/src

RUN chmod +x gradlew \
    && ./gradlew :backend:bootJar --no-daemon --stacktrace

FROM eclipse-temurin:17-jre-jammy@sha256:475d8e96b4b2bfe08999e5e854755c773af1581acdf959a4545d88f0696a2339 AS runtime

RUN groupadd --system --gid 10001 placepick \
    && useradd --system --uid 10001 --gid placepick --home-dir /app --shell /usr/sbin/nologin placepick

WORKDIR /app
COPY --from=build --chown=placepick:placepick /workspace/backend/build/libs/placepick-backend.jar app.jar

ENV SPRING_PROFILES_ACTIVE=production \
    PLACEPICK_ROLE=all \
    JAVA_TOOL_OPTIONS="-XX:InitialRAMPercentage=20 -XX:MaxRAMPercentage=65 -XX:+ExitOnOutOfMemoryError -Dfile.encoding=UTF-8"

EXPOSE 8080
USER 10001:10001

ENTRYPOINT ["java", "-jar", "/app/app.jar"]
