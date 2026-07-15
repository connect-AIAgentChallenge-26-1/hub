FROM mcr.microsoft.com/devcontainers/java:1-17-bookworm@sha256:4df2d907479f1779014e21538be2c0b3fae16d342a78d7a674ea129a8e302e57

USER root

RUN rm -f /etc/apt/sources.list.d/yarn.list \
    && apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
      ca-certificates \
      curl \
      git \
      jq \
      make \
      ripgrep \
      shellcheck \
      unzip \
      xvfb \
      fonts-noto-color-emoji \
      fonts-unifont \
      libfontconfig1 \
      libfreetype6 \
      xfonts-scalable \
      fonts-liberation \
      fonts-ipafont-gothic \
      fonts-wqy-zenhei \
      fonts-tlwg-loma-otf \
      fonts-freefont-ttf \
      libasound2 \
      libatk-bridge2.0-0 \
      libatk1.0-0 \
      libatspi2.0-0 \
      libcairo2 \
      libcups2 \
      libdbus-1-3 \
      libdrm2 \
      libgbm1 \
      libglib2.0-0 \
      libnspr4 \
      libnss3 \
      libpango-1.0-0 \
      libx11-6 \
      libxcb1 \
      libxcomposite1 \
      libxdamage1 \
      libxext6 \
      libxfixes3 \
      libxkbcommon0 \
      libxrandr2 \
    && rm -rf /var/lib/apt/lists/* \
    && java -version 2>&1 | grep -Eq 'version "17([."]|$)'

USER vscode
