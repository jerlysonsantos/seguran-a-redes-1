# Maquina proxy da LAN: Squid (proxy HTTP) sobre a imagem padrao do Kathara
FROM kathara/base

RUN apt-get update \
 && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends squid \
 && rm -rf /var/lib/apt/lists/*

COPY squid.conf /etc/squid/squid.conf
