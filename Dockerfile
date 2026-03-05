# Dockerfile
FROM node:20-slim

# Install Puppeteer dependencies and Chrome
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    ca-certificates \
    procps \
    libxss1 \
    && wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - \
    && sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list' \
    && apt-get update \
    && apt-get install -y google-chrome-stable \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Create data directories
RUN mkdir -p data/flashscore/history data/odibets/history

# ✅ FIX: Create user with proper home directory and permissions
RUN groupadd -r pptruser && useradd -r -g pptruser -G audio,video pptruser \
    && mkdir -p /home/pptruser/Downloads \
    && mkdir -p /home/pptruser/.local/share/applications \
    && chown -R pptruser:pptruser /home/pptruser \
    && chown -R pptruser:pptruser /app \
    && chown -R pptruser:pptruser /app/data

# Switch to non-root user
USER pptruser

# ✅ FIX: Set home directory environment variable
ENV HOME=/home/pptruser
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable
ENV CHROME_DEVEL_SANDBOX=/usr/local/sbin/chrome-devel-sandbox

# Create a simple sandbox workaround (optional but helps with permissions)
RUN sudo /usr/sbin/setcap 'cap_net_bind_service=+ep' $(which node) 2>/dev/null || true

VOLUME [ "/app/data" ]

CMD ["node", "web-app.js"]