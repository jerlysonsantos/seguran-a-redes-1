# Maquina rp da DMZ: SWAG (nginx + certbot + fail2ban) como proxy reverso na frente do web
FROM lscr.io/linuxserver/swag:latest

ENV URL=lab.local \
    VALIDATION=http \
    PUID=0 \
    PGID=0 \
    TZ=America/Sao_Paulo

# O lab nao tem como validar um certificado no Let's Encrypt. Sem certificado, o SWAG
# fica parado em "sleep infinity" e nao sobe o nginx. Por isso a imagem ja leva:
#  - um certificado autoassinado no lugar onde o certbot guardaria o dele
#  - o arquivo com os parametros "ja usados"; se ele faltar, o SWAG entende que os
#    parametros mudaram e apaga o certificado
RUN mkdir -p /config/etc/letsencrypt/live/${URL} \
 && openssl req -x509 -nodes -newkey rsa:2048 -days 3650 -subj "/CN=${URL}" \
      -keyout /config/etc/letsencrypt/live/${URL}/privkey.pem \
      -out /config/etc/letsencrypt/live/${URL}/fullchain.pem \
 && cp /config/etc/letsencrypt/live/${URL}/fullchain.pem /config/etc/letsencrypt/live/${URL}/chain.pem \
 && echo 'ORIGURL="lab.local" ORIGSUBDOMAINS="" ORIGONLY_SUBDOMAINS="false" ORIGEXTRA_DOMAINS="" ORIGVALIDATION="http" ORIGDNSPLUGIN="" ORIGPROPAGATION="" ORIGSTAGING="" ORIGCERTPROVIDER="" ORIGEMAIL="" ORIGCERT_PROFILE=""' \
      > /config/.donoteditthisfile.conf

# Proxy reverso para o web (10.0.2.20) em HTTP (80) e HTTPS (443)
COPY default.conf /config/nginx/site-confs/default.conf
