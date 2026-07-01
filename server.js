const express = require('express');
const fs = require('fs');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { MercadoPagoConfig, Preference, Payment, WebhookSignatureValidator } = require('mercadopago');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'troque-esta-senha';

// URL publica onde o site vai ficar no ar (sem barra no final).
// Necessaria pra montar os back_urls e o notification_url do Mercado Pago.
// Em localhost o pagamento nao funciona de ponta a ponta porque o MP
// precisa conseguir chamar o notification_url pela internet.
const APP_BASE_URL = (process.env.APP_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');

const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN || '';
const MP_WEBHOOK_SECRET = process.env.MP_WEBHOOK_SECRET || '';

const mpClient = MP_ACCESS_TOKEN ? new MercadoPagoConfig({ accessToken: MP_ACCESS_TOKEN }) : null;

const SERVICOS_PATH = path.join(__dirname, 'data', 'servicos.json');
const AGENDAMENTOS_PATH = path.join(__dirname, 'data', 'agendamentos.json');

// Horario de funcionamento: 09h as 21h, segunda a sabado
const HORA_INICIO = 9;
const HORA_FIM = 21;
const DIAS_FECHADOS = [0]; // 0 = domingo

// Tempo que um agendamento "pendente_pagamento" segura o horario antes de
// ser considerado abandonado e liberar a vaga de novo.
const PENDENTE_EXPIRA_MIN = 20;

// ---------- Seguranca ----------

// Helmet define cabecalhos HTTP de seguranca (X-Frame-Options, CSP, etc.)
app.use(helmet());

// Limita requisicoes por IP pra evitar flood e forca bruta.
// A API de agendamento aceita no maximo 30 tentativas por 10 minutos por IP.
const limiteGeral = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { erro: 'Muitas requisicoes. Aguarde alguns minutos e tente de novo.' }
});

// O painel admin tem um limite ainda mais restrito: 10 tentativas por 15 minutos.
// Isso torna forca bruta na senha inviavel na pratica.
const limiteAdmin = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { erro: 'Muitas tentativas de acesso ao admin. Aguarde 15 minutos.' }
});

app.use('/api/agendamentos', limiteGeral);
app.use('/api/horarios', limiteGeral);
app.use('/api/admin', limiteAdmin);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function lerJSON(caminho) {
  return JSON.parse(fs.readFileSync(caminho, 'utf-8'));
}

function salvarJSON(caminho, dados) {
  fs.writeFileSync(caminho, JSON.stringify(dados, null, 2));
}

// Um agendamento pendente de pagamento mais velho que PENDENTE_EXPIRA_MIN
// e considerado abandonado. Essa funcao marca esses casos como "expirado"
// (liberando o horario) e devolve a lista ja atualizada.
function expirarPendentesAntigos(agendamentos) {
  const agora = Date.now();
  let mudou = false;

  agendamentos.forEach((a) => {
    if (a.status === 'pendente_pagamento') {
      const idadeMin = (agora - new Date(a.criadoEm).getTime()) / 60000;
      if (idadeMin > PENDENTE_EXPIRA_MIN) {
        a.status = 'expirado';
        mudou = true;
      }
    }
  });

  if (mudou) salvarJSON(AGENDAMENTOS_PATH, agendamentos);
  return agendamentos;
}

// Um agendamento so "trava" o horario se estiver confirmado ou se ainda
// estiver dentro da janela de pagamento pendente.
function ocupaSlot(a) {
  return a.status === 'confirmado' || a.status === 'pendente_pagamento';
}

function gerarHorariosBase() {
  const horarios = [];
  for (let h = HORA_INICIO; h < HORA_FIM; h++) {
    horarios.push(`${String(h).padStart(2, '0')}:00`);
  }
  return horarios;
}

// Calcula a data e a hora atuais no fuso de Brasilia, independente de em
// qual fuso o servidor estiver rodando (ex: a maioria dos hosts usa UTC).
// O Brasil nao tem mais horario de verao, entao -03:00 e fixo o ano todo.
function agoraBrasil() {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(new Date());

  const obter = (tipo) => partes.find((p) => p.type === tipo).value;

  return {
    data: `${obter('year')}-${obter('month')}-${obter('day')}`,
    hora: Number(obter('hour')),
    minuto: Number(obter('minute'))
  };
}

// Dia da semana (0 = domingo) de uma data YYYY-MM-DD, sem depender de fuso.
function diaDaSemana(dataISO) {
  return new Date(dataISO + 'T12:00:00Z').getUTCDay();
}

// GET /api/servicos -> lista os servicos oferecidos
app.get('/api/servicos', (req, res) => {
  res.json(lerJSON(SERVICOS_PATH));
});

// GET /api/horarios?data=YYYY-MM-DD -> horarios livres naquele dia
app.get('/api/horarios', (req, res) => {
  const { data } = req.query;

  if (!data || !/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    return res.status(400).json({ erro: 'Informe uma data valida (YYYY-MM-DD).' });
  }

  if (isNaN(new Date(data + 'T00:00:00Z').getTime())) {
    return res.status(400).json({ erro: 'Data invalida.' });
  }

  const { data: hojeBR, hora: horaBR } = agoraBrasil();

  if (data < hojeBR) {
    return res.json({ horarios: [], motivo: 'data-passada' });
  }

  if (DIAS_FECHADOS.includes(diaDaSemana(data))) {
    return res.json({ horarios: [], motivo: 'fechado' });
  }

  let horarios = gerarHorariosBase();

  // remove horarios que ja passaram, se a data selecionada for hoje (no fuso de Brasilia)
  if (data === hojeBR) {
    horarios = horarios.filter((h) => {
      const [hh] = h.split(':').map(Number);
      return hh > horaBR;
    });
  }

  // remove horarios ja ocupados (confirmados ou pendentes de pagamento ainda na janela)
  let agendamentos = lerJSON(AGENDAMENTOS_PATH);
  agendamentos = expirarPendentesAntigos(agendamentos);

  const ocupados = agendamentos
    .filter((a) => a.data === data && ocupaSlot(a))
    .map((a) => a.horario);

  horarios = horarios.filter((h) => !ocupados.includes(h));

  res.json({ horarios });
});

// POST /api/agendamentos -> reserva o horario e gera o checkout de pagamento
app.post('/api/agendamentos', async (req, res) => {
  const { servicoId, data, horario, nome, contato, observacoes } = req.body || {};

  if (!servicoId || !data || !horario || !nome || !contato) {
    return res.status(400).json({ erro: 'Preencha todos os campos obrigatorios.' });
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || !/^\d{2}:\d{2}$/.test(horario)) {
    return res.status(400).json({ erro: 'Data ou horario em formato invalido.' });
  }

  const servicos = lerJSON(SERVICOS_PATH);
  const servico = servicos.find((s) => s.id === servicoId);
  if (!servico) {
    return res.status(400).json({ erro: 'Servico invalido.' });
  }

  if (!mpClient) {
    return res.status(500).json({ erro: 'Pagamento ainda nao configurado neste servidor (falta MP_ACCESS_TOKEN).' });
  }

  let agendamentos = expirarPendentesAntigos(lerJSON(AGENDAMENTOS_PATH));

  const conflito = agendamentos.find((a) => a.data === data && a.horario === horario && ocupaSlot(a));
  if (conflito) {
    return res.status(409).json({ erro: 'Esse horario acabou de ser reservado por outra pessoa. Escolha outro horario.' });
  }

  const novoAgendamento = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    servicoId,
    servicoNome: servico.nome,
    preco: servico.preco,
    data,
    horario,
    nome: String(nome).trim(),
    contato: String(contato).trim(),
    observacoes: observacoes ? String(observacoes).trim() : '',
    status: 'pendente_pagamento',
    pagamentoId: null,
    criadoEm: new Date().toISOString()
  };

  // Reserva o horario antes de chamar o Mercado Pago, pra ninguem mais
  // conseguir marcar o mesmo slot enquanto o pagamento esta em andamento.
  agendamentos.push(novoAgendamento);
  salvarJSON(AGENDAMENTOS_PATH, agendamentos);

  try {
    const preference = new Preference(mpClient);
    const expiraEm = new Date(Date.now() + PENDENTE_EXPIRA_MIN * 60000);

    const resultado = await preference.create({
      body: {
        items: [
          {
            id: servico.id,
            title: `BTW Tweaks — ${servico.nome}`,
            description: servico.descricao,
            quantity: 1,
            currency_id: 'BRL',
            unit_price: servico.preco
          }
        ],
        external_reference: novoAgendamento.id,
        statement_descriptor: 'BTWTWEAKS',
        back_urls: {
          success: `${APP_BASE_URL}/confirmacao.html`,
          pending: `${APP_BASE_URL}/confirmacao.html`,
          failure: `${APP_BASE_URL}/confirmacao.html`
        },
        auto_return: 'approved',
        notification_url: `${APP_BASE_URL}/api/webhooks/mercadopago`,
        expires: true,
        expiration_date_from: new Date().toISOString(),
        expiration_date_to: expiraEm.toISOString()
      }
    });

    novoAgendamento.preferenciaId = resultado.id;
    salvarJSON(AGENDAMENTOS_PATH, agendamentos);

    res.status(201).json({ agendamento: novoAgendamento, checkoutUrl: resultado.init_point });
  } catch (erro) {
    // Pagamento nao pode ser iniciado: libera o horario de volta
    agendamentos = lerJSON(AGENDAMENTOS_PATH).filter((a) => a.id !== novoAgendamento.id);
    salvarJSON(AGENDAMENTOS_PATH, agendamentos);

    console.error('Erro criando preferencia no Mercado Pago:', erro?.message || erro);
    res.status(502).json({ erro: 'Nao foi possivel iniciar o pagamento. Tente novamente em instantes.' });
  }
});

// GET /api/agendamentos/:id/status -> usado pela pagina de confirmacao para
// saber se o pagamento ja foi aprovado (o id e um token aleatorio, nao da
// pra adivinhar o agendamento de outra pessoa por aqui)
app.get('/api/agendamentos/:id/status', (req, res) => {
  const agendamentos = expirarPendentesAntigos(lerJSON(AGENDAMENTOS_PATH));
  const agendamento = agendamentos.find((a) => a.id === req.params.id);

  if (!agendamento) {
    return res.status(404).json({ erro: 'Agendamento nao encontrado.' });
  }

  res.json({
    status: agendamento.status,
    servicoNome: agendamento.servicoNome,
    data: agendamento.data,
    horario: agendamento.horario
  });
});

// POST /api/webhooks/mercadopago -> recebe a notificacao de pagamento
app.post('/api/webhooks/mercadopago', async (req, res) => {
  // Responde rapido: o Mercado Pago reenvia a notificacao se demorar ou
  // se nao receber 200, entao confirmamos o recebimento e processamos depois.
  res.sendStatus(200);

  try {
    if (!mpClient) return;

    const dataId = req.query['data.id'] || req.query.id || req.body?.data?.id;
    if (!dataId) return;

    if (MP_WEBHOOK_SECRET) {
      try {
        WebhookSignatureValidator.validate({
          xSignature: req.headers['x-signature'],
          xRequestId: req.headers['x-request-id'],
          dataId,
          secret: MP_WEBHOOK_SECRET,
          toleranceSeconds: 300
        });
      } catch (erroAssinatura) {
        console.error('Webhook do Mercado Pago com assinatura invalida:', erroAssinatura?.reason || erroAssinatura);
        return;
      }
    }

    const pagamento = await new Payment(mpClient).get({ id: dataId });
    const agendamentoId = pagamento.external_reference;
    if (!agendamentoId) return;

    const agendamentos = lerJSON(AGENDAMENTOS_PATH);
    const agendamento = agendamentos.find((a) => a.id === agendamentoId);
    if (!agendamento) return;

    if (pagamento.status === 'approved') {
      agendamento.status = 'confirmado';
      agendamento.pagamentoId = String(dataId);
    } else if (pagamento.status === 'rejected' || pagamento.status === 'cancelled') {
      agendamento.status = 'cancelado';
    }
    // 'pending' e 'in_process' ficam como pendente_pagamento mesmo

    salvarJSON(AGENDAMENTOS_PATH, agendamentos);
  } catch (erro) {
    console.error('Erro processando webhook do Mercado Pago:', erro?.message || erro);
  }
});

function autenticarAdmin(req, res, next) {
  const senha = req.headers['x-admin-password'];
  if (senha !== ADMIN_PASSWORD) {
    return res.status(401).json({ erro: 'Senha invalida.' });
  }
  next();
}

// GET /api/admin/agendamentos -> lista completa (protegida por senha)
app.get('/api/admin/agendamentos', autenticarAdmin, (req, res) => {
  const agendamentos = expirarPendentesAntigos(lerJSON(AGENDAMENTOS_PATH)).sort((a, b) =>
    (a.data + a.horario).localeCompare(b.data + b.horario)
  );
  res.json(agendamentos);
});

// POST /api/admin/agendamentos -> cria um agendamento manualmente (ex: reagendar
// um cliente por fora, sem passar pelo checkout do Mercado Pago). Entra direto
// como "confirmado", ja que o administrador esta combinando isso manualmente.
app.post('/api/admin/agendamentos', autenticarAdmin, (req, res) => {
  const { servicoId, data, horario, nome, contato, observacoes } = req.body || {};

  if (!servicoId || !data || !horario || !nome || !contato) {
    return res.status(400).json({ erro: 'Preencha todos os campos obrigatorios.' });
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || !/^\d{2}:\d{2}$/.test(horario)) {
    return res.status(400).json({ erro: 'Data ou horario em formato invalido.' });
  }

  const servicos = lerJSON(SERVICOS_PATH);
  const servico = servicos.find((s) => s.id === servicoId);
  if (!servico) {
    return res.status(400).json({ erro: 'Servico invalido.' });
  }

  const agendamentos = expirarPendentesAntigos(lerJSON(AGENDAMENTOS_PATH));

  const conflito = agendamentos.find((a) => a.data === data && a.horario === horario && ocupaSlot(a));
  if (conflito) {
    return res.status(409).json({ erro: 'Ja existe um agendamento nesse horario.' });
  }

  const novoAgendamento = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    servicoId,
    servicoNome: servico.nome,
    preco: servico.preco,
    data,
    horario,
    nome: String(nome).trim(),
    contato: String(contato).trim(),
    observacoes: observacoes ? String(observacoes).trim() : '',
    status: 'confirmado',
    pagamentoId: 'manual',
    criadoEm: new Date().toISOString()
  };

  agendamentos.push(novoAgendamento);
  salvarJSON(AGENDAMENTOS_PATH, agendamentos);

  res.status(201).json({ agendamento: novoAgendamento });
});

// DELETE /api/admin/agendamentos/:id -> cancela um agendamento (protegida por senha)
app.delete('/api/admin/agendamentos/:id', autenticarAdmin, (req, res) => {
  let agendamentos = lerJSON(AGENDAMENTOS_PATH);
  const tamanhoAntes = agendamentos.length;
  agendamentos = agendamentos.filter((a) => a.id !== req.params.id);

  if (agendamentos.length === tamanhoAntes) {
    return res.status(404).json({ erro: 'Agendamento nao encontrado.' });
  }

  salvarJSON(AGENDAMENTOS_PATH, agendamentos);
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`BTW Tweaks rodando em http://localhost:${PORT}`);
});
