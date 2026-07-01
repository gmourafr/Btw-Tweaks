# BTW Tweaks — site + agendamento

Site institucional com sistema de agendamento 100% funcional para a BTW Tweaks.

## Stack

- Frontend: HTML, CSS e JavaScript puro (sem framework)
- Backend: Node.js + Express
- Banco de dados: arquivos JSON em `data/` (simples de inspecionar e editar na mão; dá pra trocar por MySQL/SQLite depois se o volume crescer)

## Como funciona o agendamento

- `GET /api/servicos` — lista os serviços (vem de `data/servicos.json`)
- `GET /api/horarios?data=YYYY-MM-DD` — calcula os horários livres naquele dia (09h–21h, fechado aos domingos), removendo horários que já passaram, já confirmados, ou com pagamento pendente dentro da janela de espera
- `POST /api/agendamentos` — reserva o horário, cria uma preferência de pagamento no Mercado Pago e devolve a URL do checkout; se alguém reservar o mesmo horário um segundo antes, devolve erro 409 e o front atualiza a lista sozinho
- `POST /api/webhooks/mercadopago` — recebe a confirmação de pagamento do Mercado Pago e atualiza o agendamento
- `GET /api/agendamentos/:id/status` — usado pela página de confirmação pra saber se o pagamento já foi aprovado
- `GET /api/admin/agendamentos` e `DELETE /api/admin/agendamentos/:id` — protegidos por senha (header `x-admin-password`), usados pela página `/admin.html`

Os agendamentos ficam salvos em `data/agendamentos.json`, cada um com um `status`: `pendente_pagamento` (acabou de reservar, esperando pagar), `confirmado` (pagamento aprovado), `cancelado` (pagamento recusado) ou `expirado` (ninguém pagou dentro de 20 minutos — o horário volta a ficar livre automaticamente).

## Pagamento com Mercado Pago

O fluxo é: o cliente preenche o formulário → o horário fica reservado como "pendente" → ele é redirecionado pro checkout do Mercado Pago → paga → o Mercado Pago avisa o servidor por um webhook → o agendamento vira "confirmado" sozinho, sem precisar de nada manual. Se ele abandonar o checkout sem pagar, o horário libera depois de 20 minutos.

Pra ativar:

1. Crie uma aplicação em [mercadopago.com.br/developers/panel](https://www.mercadopago.com.br/developers/panel)
2. Pegue o **Access Token** (use o de **teste** primeiro pra validar tudo, depois troque pelo de produção) e coloque em `MP_ACCESS_TOKEN`
3. Defina `APP_BASE_URL` com a URL pública do site (ex: `https://btwtweaks.up.railway.app`) — **isso não funciona em `localhost`**, porque o Mercado Pago precisa conseguir chamar seu servidor pela internet
4. Na mesma aplicação, configure um Webhook apontando pra `SUA_URL/api/webhooks/mercadopago`, escutando o evento de **Pagamentos**, e copie a "chave secreta" gerada pra `MP_WEBHOOK_SECRET` (opcional, mas evita que alguém forje uma notificação falsa de pagamento aprovado)
5. Pra testar pagamentos sem usar dinheiro de verdade, crie um usuário de teste comprador e use os [cartões de teste do Mercado Pago](https://www.mercadopago.com.br/developers/pt/docs/checkout-pro/additional-content/your-integrations/test/cards)

Os preços de cada serviço (usados no checkout) vêm de `data/servicos.json`.

## Rodando localmente

```bash
npm install
ADMIN_PASSWORD=sua-senha npm start
```

Depois acesse:

- `http://localhost:3000` — site
- `http://localhost:3000/admin.html` — painel para ver o status de pagamento e cancelar agendamentos (pede a senha definida em `ADMIN_PASSWORD`)

Se não definir `ADMIN_PASSWORD`, o painel usa a senha padrão `troque-esta-senha` — troque antes de colocar no ar. Sem `MP_ACCESS_TOKEN` configurado, o agendamento responde com um erro claro em vez de quebrar — útil pra mexer no resto do site sem precisar de credencial do Mercado Pago o tempo todo.

## Editando os serviços, preços e horário de funcionamento

- Serviços, descrições, duração e preço: edite `data/servicos.json`
- Horário de funcionamento e dias fechados: edite as constantes `HORA_INICIO`, `HORA_FIM` e `DIAS_FECHADOS` no topo de `server.js`

## Deploy (Railway ou Render)

1. Suba esta pasta para um repositório no GitHub
2. Crie um novo projeto/serviço apontando para o repositório
3. Configure as variáveis de ambiente no painel da plataforma: `ADMIN_PASSWORD`, `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET` e `APP_BASE_URL` (a própria URL que a plataforma vai te dar)
4. Build command: `npm install` — Start command: `npm start`
5. Depois do primeiro deploy, volte no painel do Mercado Pago e configure o Webhook com a URL final (`SUA_URL/api/webhooks/mercadopago`)

Importante: como o "banco de dados" aqui é um arquivo JSON local, em algumas plataformas (Render free tier, por exemplo) o sistema de arquivos pode ser resetado a cada novo deploy. Funciona bem para começar e validar o site; se o volume de agendamentos crescer, vale migrar `data/agendamentos.json` para um banco de verdade (SQLite ou MySQL).

## Personalizando

- Cores, fontes e espaçamentos: `public/css/style.css` (tudo centralizado nas variáveis CSS no topo do arquivo)
- Textos do site: `public/index.html`
- Logo: atualmente é só texto estilizado (`BTW` + `TWEAKS`) no header e no footer — sem dependência de imagem
