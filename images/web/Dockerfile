# Maquina web da DMZ: servidor web (Apache) atras do proxy reverso rp
FROM kathara/base

# Site da DMZ: / (pagina inicial), /public e /admin
RUN rm -f /var/www/html/index.html
COPY site/ /var/www/html/
