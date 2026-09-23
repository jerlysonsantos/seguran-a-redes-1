# Experimentos da REDE

# L2

MAC do PC1 66:fc:c4:53:1d:1c
MAC DO PC2 be:16:74:ee:52:8c

Fazendo o teste antes observado que o ping das maquina para a internet funciona normalmente

```bash
22:25:44.667697 66:fc:c4:53:1d:1c > c2:66:3c:c2:e0:53, ethertype IPv4 (0x0800), length 98: 10.0.1.10 > 8.8.8.8: ICMP echo request, id 64027, seq 1, length 64
22:25:44.702439 c2:66:3c:c2:e0:53 > 66:fc:c4:53:1d:1c, ethertype IPv4 (0x0800), length 98: 8.8.8.8 > 10.0.1.10: ICMP echo reply, id 64027, seq 1, length 64
22:25:45.669081 66:fc:c4:53:1d:1c > c2:66:3c:c2:e0:53, ethertype IPv4 (0x0800), length 98: 10.0.1.10 > 8.8.8.8: ICMP echo request, id 64027, seq 2, length 64
22:25:45.706588 c2:66:3c:c2:e0:53 > 66:fc:c4:53:1d:1c, ethertype IPv4 (0x0800), length 98: 8.8.8.8 > 10.0.1.10: ICMP echo reply, id 64027, seq 2, length 64
22:25:46.670513 66:fc:c4:53:1d:1c > c2:66:3c:c2:e0:53, ethertype IPv4 (0x0800), length 98: 10.0.1.10 > 8.8.8.8: ICMP echo request, id 64027, seq 3, length 64
22:25:46.707346 c2:66:3c:c2:e0:53 > 66:fc:c4:53:1d:1c, ethertype IPv4 (0x0800), length 98: 8.8.8.8 > 10.0.1.10: ICMP echo reply, id 64027, seq 3, length 64
22:25:56.472608 be:16:74:ee:52:8c > c2:66:3c:c2:e0:53, ethertype IPv4 (0x0800), length 98: 10.0.1.11 > 8.8.8.8: ICMP echo request, id 29580, seq 1, length 64
22:25:56.510255 c2:66:3c:c2:e0:53 > be:16:74:ee:52:8c, ethertype IPv4 (0x0800), length 98: 8.8.8.8 > 10.0.1.11: ICMP echo reply, id 29580, seq 1, length 64
22:25:57.472960 be:16:74:ee:52:8c > c2:66:3c:c2:e0:53, ethertype IPv4 (0x0800), length 98: 10.0.1.11 > 8.8.8.8: ICMP echo request, id 29580, seq 2, length 64
22:25:57.507364 c2:66:3c:c2:e0:53 > be:16:74:ee:52:8c, ethertype IPv4 (0x0800), length 98: 8.8.8.8 > 10.0.1.11: ICMP echo reply, id 29580, seq 2, length 64
22:25:58.473950 be:16:74:ee:52:8c > c2:66:3c:c2:e0:53, ethertype IPv4 (0x0800), length 98: 10.0.1.11 > 8.8.8.8: ICMP echo request, id 29580, seq 3, length 64
22:25:58.510256 c2:66:3c:c2:e0:53 > be:16:74:ee:52:8c, ethertype IPv4 (0x0800), length 98: 8.8.8.8 > 10.0.1.11: ICMP echo reply, id 29580, seq 3, length 64
```

Depois das regras aplicadas o PC2 não consegue enxergar mais a rede, só a maquina ao lado

# L3

Rodando o tcpdump na maquina do fw e pingando foi tudo ok. depois que bloqueado a regra o ping deixa de passar.

Para o IP criamos um site fake no R0 para representar

```bash

kathara connect r0
ip addr add 203.0.113.10/32 dev lo
ip addr add 203.0.113.11/32 dev lo
mkdir -p /tmp/site && echo "site fake" > /tmp/site/index.html
cd /tmp/site && python3 -m http.server 80
```

Com esses comandos rodamos um site falso e em outro terminal olhamos o trafego e chamamos o site por dois IP diferente.

```bash
Serving HTTP on 0.0.0.0 port 80 (http://0.0.0.0:80/) ...
10.0.1.10 - - [23/Sep/2026 22:49:33] "GET / HTTP/1.1" 200 -
10.0.1.10 - - [23/Sep/2026 22:50:10] "GET / HTTP/1.1" 200 -
10.0.1.10 - - [23/Sep/2026 22:51:56] "GET / HTTP/1.1" 200 -
```

Depois aplicamos a regra e foi notado que das duas chamadas a primeira falha, porém o outro IP chama, o que conclui que só bloquear por IP não é a melhor solução, pois se tiver mais de um IP é contornavel

# L4

Para esse foi semelhante ao L3. Iniciamos com

```bash
kathara connect r0
ip addr add 203.0.113.10/32 dev lo 2>/dev/null
mkdir -p /tmp/p2p && cd /tmp/p2p && echo "PEER P2P" > index.html
python3 -m http.server 6881  > /dev/null 2>&1 &
python3 -m http.server 51413 > /dev/null 2>&1 &
tcpdump -n -i eth0 udp port 6881
```

e chamando o servidor tivemos um retorno

```bash
23:07:22.696229 IP 10.0.1.10.44870 > 203.0.113.10.6881: UDP, length 9
```

e depois de aplicar as regras que bloqueam as portas UDP que chamam a rede P2P todas chamads falham.

Sobre se isso é util, cai um pouco no problema do L3, essas portas são assim por convenção, mas essas aplicações podem rodar em outras portas o que deixaria de fazer efeito o bloqueio.

# L7

O que vamos falar
e sobre o DNS Filtering, com o exemplo que uso pessoalmente que é o Pi-hole que ele trabalha bloqueando os DNS listados na aplicação, no caso do Pi-hole existem listas separados por categorias que são mantidas pela comunidade como por exemplo DNS relacionados a anuncios. Ele tem uma limitação que a pessoa sabendo o IP vai resolver mesmo assim, ele apenas age no filtro do DNS.

# Defense in Depth

Caso DMZ seja compromentido, com essa arquitetura, a LAN não seria acessada diretamente pois não teria o acesso, mas um atacante poderia fazer o DMZ de ManInMiddle e atacar o lan indiretamente.

Mesmo com o web comprometido, alguns controles da arquitetura continuam limitando o acesso à LAN. O primeiro é a própria segmentação, o web está em outra rede e qualquer pacote para o pc1 ou pc2 precisa passar pelo fw. No fw a política padrão é DROP e não existe nenhuma regra liberando conexões novas da DMZ para a LAN, a regra stateful só deixa passar respostas de conexões que a LAN abriu, então o atacante não consegue iniciar uma conexão a partir do web. Também não liberamos saída da DMZ para a Internet, o que impede o atacante de baixar ferramentas ou mandar dados para fora pelo web. O fw ainda bloqueia o INPUT, então o web não consegue atacar o próprio firewall, e a rede de gerenciamento fica separada, sem acesso a partir da DMZ.

Por outro lado, alguns pontos continuam expostos. A LAN pode acessar o web nas portas 80 e 443, então o servidor comprometido pode devolver páginas maliciosas para os usuários e essas respostas passam pelo firewall. O web e o dns estão no mesmo segmento sem nada entre eles, então o atacante pode tentar comprometer o dns também e, a partir dele, responder a LAN com endereços falsos.

É aí que entra a ideia de camadas. O firewall de perímetro controla o que entra da Internet, a DMZ separa os serviços expostos da rede interna, a segmentação garante que o tráfego entre as redes passe pelo fw, e as regras de filtragem definem com menor privilégio o que cada rede pode acessar.
