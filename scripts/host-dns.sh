#!/bin/bash
cd "$(dirname "$0")/.." || exit 1
dns=$(awk '/^nameserver/ && $2 ~ /^[0-9.]+$/ {print $2; exit}' /etc/resolv.conf)
echo "${dns:-8.8.8.8}" > shared/host-dns
echo "DNS do host: $(cat shared/host-dns)"
