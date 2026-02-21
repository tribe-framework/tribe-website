FROM apache/tika:latest-full

# Switch to root to install additional language packs
USER root

# Install ALL available Tesseract language packs
RUN apt-get update && \
    # Get list of all tesseract language packages and install them
    apt-get install -y $(apt-cache search tesseract-ocr- | \
        awk '{print $1}' | \
        grep -E '^tesseract-ocr-[a-z]{3}' | \
        grep -v 'tesseract-ocr-$' | \
        head -50) && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Verify installation
RUN tesseract --list-langs || true

# Switch back to original user
USER nobody

# Keep original entrypoint
ENTRYPOINT ["/bin/sh", "-c", "exec java -jar /tika-server-*.jar \"$@\"", "--"]
CMD ["--host=0.0.0.0", "--port=9998"]