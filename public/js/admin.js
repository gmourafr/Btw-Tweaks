const telaLogin = document.getElementById('telaLogin');
const telaPainel = document.getElementById('telaPainel');
const senhaInput = document.getElementById('senhaAdmin');
const btnEntrar = document.getElementById('btnEntrar');
const loginMsg = document.getElementById('loginMsg');
const tabelaContainer = document.getElementById('tabelaContainer');
const contador = document.getElementById('contador');
const filtros = document.getElementById('filtros');

let senhaAtual = sessionStorage.getItem('btw_admin_senha') || '';
let agendamentosAtuais = [];
let filtroStatusAtivo = 'todos';
let filtroDataAtiva = null; // 'YYYY-MM-DD' ou null

senhaInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') tentarEntrar();
});
btnEntrar.addEventListener('click', tentarEntrar);

filtros.addEventListener('click', (e) => {
  const btn = e.target.closest('.filtro-btn');
  if (!btn) return;

  filtroStatusAtivo = btn.dataset.filtro;
  filtros.querySelectorAll('.filtro-btn').forEach((b) => b.classList.remove('ativo'));
  btn.classList.add('ativo');
  renderizarCards(agendamentosAtuais);
});

async function tentarEntrar() {
  const senha = senhaInput.value.trim();
  if (!senha) return;

  const ok = await carregarAgendamentos(senha);
  if (ok) {
    senhaAtual = senha;
    sessionStorage.setItem('btw_admin_senha', senha);
    telaLogin.style.display = 'none';
    telaPainel.style.display = 'block';
  } else {
    loginMsg.className = 'form-msg erro';
    loginMsg.textContent = 'Senha incorreta.';
  }
}

async function carregarAgendamentos(senha) {
  try {
    const resp = await fetch('/api/admin/agendamentos', {
      headers: { 'x-admin-password': senha }
    });

    if (!resp.ok) return false;

    agendamentosAtuais = await resp.json();
    renderizarCards(agendamentosAtuais);
    renderizarMiniCalendario();
    return true;
  } catch (erro) {
    return false;
  }
}

function rotuloStatus(status) {
  const mapa = {
    confirmado: 'Pago',
    pendente_pagamento: 'Aguardando pagamento',
    cancelado: 'Cancelado',
    expirado: 'Expirado'
  };
  return mapa[status] || status;
}

function formatarData(iso) {
  const [ano, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${ano}`;
}

function escapeHtml(texto) {
  const div = document.createElement('div');
  div.textContent = texto;
  return div.innerHTML;
}

function passaNoFiltro(a) {
  if (filtroDataAtiva && a.data !== filtroDataAtiva) return false;
  if (filtroStatusAtivo === 'todos') return true;
  if (filtroStatusAtivo === 'cancelado_expirado') return a.status === 'cancelado' || a.status === 'expirado';
  return a.status === filtroStatusAtivo;
}

function renderizarCards(agendamentos) {
  const visiveis = agendamentos.filter(passaNoFiltro).sort((a, b) => (a.data + a.horario).localeCompare(b.data + b.horario));

  contador.textContent =
    agendamentos.length === 0 ? '' : `${visiveis.length} de ${agendamentos.length} agendamento${agendamentos.length === 1 ? '' : 's'}`;

  if (agendamentos.length === 0) {
    tabelaContainer.innerHTML = '<p class="vazio">Nenhum agendamento ainda.</p>';
    return;
  }

  if (visiveis.length === 0) {
    tabelaContainer.innerHTML = '<p class="vazio">Nenhum agendamento nesse filtro.</p>';
    return;
  }

  tabelaContainer.innerHTML = visiveis
    .map((a) => {
      const observacoesHtml = a.observacoes
        ? `
        <div class="card-observacoes">
          <span class="dado-label">Observações do cliente</span>
          <div class="obs-texto">${escapeHtml(a.observacoes)}</div>
        </div>
      `
        : '';

      const podeCancel = a.status === 'confirmado' || a.status === 'pendente_pagamento';
      const manual = a.pagamentoId === 'manual';

      return `
        <div class="agendamento-card" data-id="${a.id}">
          <div class="card-topo">
            <div>
              <div class="card-quando">${formatarData(a.data)} às ${a.horario}</div>
              <div class="card-servico">${escapeHtml(a.servicoNome)}${manual ? ' · agendado manualmente' : ''}</div>
            </div>
            <span class="status-pill ${a.status}"><span class="status-dot"></span>${rotuloStatus(a.status)}</span>
          </div>

          <div class="card-dados">
            <div>
              <div class="dado-label">Nome</div>
              <div class="dado-valor">${escapeHtml(a.nome)}</div>
            </div>
            <div>
              <div class="dado-label">WhatsApp / Discord</div>
              <div class="dado-valor mono">${escapeHtml(a.contato)}</div>
            </div>
          </div>

          ${observacoesHtml}

          ${
            podeCancel
              ? `<div class="card-acoes"><button class="btn-cancelar" data-cancelar-id="${a.id}">Cancelar agendamento</button></div>`
              : ''
          }
        </div>
      `;
    })
    .join('');
}

tabelaContainer.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-cancelar-id]');
  if (!btn) return;
  cancelarAgendamento(btn.dataset.cancelarId);
});

async function cancelarAgendamento(id) {
  if (!confirm('Cancelar este agendamento?')) return;

  await fetch(`/api/admin/agendamentos/${id}`, {
    method: 'DELETE',
    headers: { 'x-admin-password': senhaAtual }
  });

  carregarAgendamentos(senhaAtual);
}

// ==================== Mini calendario (visao mensal) ====================

const miniCalTitulo = document.getElementById('miniCalTitulo');
const miniCalGrid = document.getElementById('miniCalGrid');
const miniCalAnterior = document.getElementById('miniCalAnterior');
const miniCalProximo = document.getElementById('miniCalProximo');
const miniCalLimpar = document.getElementById('miniCalLimpar');

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

const hojeAdmin = new Date();
let miniCalMes = hojeAdmin.getMonth();
let miniCalAno = hojeAdmin.getFullYear();

function doisDigitos(n) {
  return String(n).padStart(2, '0');
}

function formatarISO(ano, mes, dia) {
  return `${ano}-${doisDigitos(mes + 1)}-${doisDigitos(dia)}`;
}

// status que "ocupam" um dia visualmente no calendario
function statusRelevante(status) {
  return status === 'confirmado' || status === 'pendente_pagamento';
}

function renderizarMiniCalendario() {
  miniCalTitulo.textContent = `${MESES[miniCalMes]} ${miniCalAno}`;

  const primeiroDiaSemana = new Date(miniCalAno, miniCalMes, 1).getDay();
  const totalDias = new Date(miniCalAno, miniCalMes + 1, 0).getDate();

  // agrupa agendamentos relevantes por data, dentro do mes exibido
  const porDia = {};
  agendamentosAtuais.forEach((a) => {
    if (!statusRelevante(a.status)) return;
    if (!porDia[a.data]) porDia[a.data] = [];
    porDia[a.data].push(a);
  });

  miniCalGrid.innerHTML = '';

  for (let i = 0; i < primeiroDiaSemana; i++) {
    const vazio = document.createElement('span');
    vazio.className = 'mini-cal-dia vazio-cel';
    miniCalGrid.appendChild(vazio);
  }

  for (let dia = 1; dia <= totalDias; dia++) {
    const iso = formatarISO(miniCalAno, miniCalMes, dia);
    const doDia = porDia[iso] || [];

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mini-cal-dia';
    if (doDia.length > 0) btn.classList.add('tem-agendamento');
    if (filtroDataAtiva === iso) btn.classList.add('selecionado');

    const numero = document.createElement('span');
    numero.textContent = dia;
    btn.appendChild(numero);

    if (doDia.length > 0) {
      const pontos = document.createElement('span');
      pontos.className = 'mini-cal-pontos';
      doDia.slice(0, 4).forEach((a) => {
        const ponto = document.createElement('span');
        ponto.className = 'mini-cal-ponto' + (a.status === 'pendente_pagamento' ? ' pendente' : '');
        pontos.appendChild(ponto);
      });
      btn.appendChild(pontos);
      btn.setAttribute('aria-label', `${dia}, ${doDia.length} agendamento(s)`);
    }

    btn.addEventListener('click', () => {
      filtroDataAtiva = filtroDataAtiva === iso ? null : iso;
      miniCalLimpar.hidden = !filtroDataAtiva;
      renderizarMiniCalendario();
      renderizarCards(agendamentosAtuais);
    });

    miniCalGrid.appendChild(btn);
  }
}

miniCalAnterior.addEventListener('click', () => {
  miniCalMes -= 1;
  if (miniCalMes < 0) {
    miniCalMes = 11;
    miniCalAno -= 1;
  }
  renderizarMiniCalendario();
});

miniCalProximo.addEventListener('click', () => {
  miniCalMes += 1;
  if (miniCalMes > 11) {
    miniCalMes = 0;
    miniCalAno += 1;
  }
  renderizarMiniCalendario();
});

miniCalLimpar.addEventListener('click', () => {
  filtroDataAtiva = null;
  miniCalLimpar.hidden = true;
  renderizarMiniCalendario();
  renderizarCards(agendamentosAtuais);
});

// ==================== Modal: novo agendamento manual ====================

const modalOverlay = document.getElementById('modalOverlay');
const btnNovoAgendamento = document.getElementById('btnNovoAgendamento');
const modalFechar = document.getElementById('modalFechar');
const formNovoAgendamento = document.getElementById('formNovoAgendamento');
const admServico = document.getElementById('admServico');
const admSlotsContainer = document.getElementById('admSlotsContainer');
const admSlotsMsg = document.getElementById('admSlotsMsg');
const admNome = document.getElementById('admNome');
const admContato = document.getElementById('admContato');
const admObservacoes = document.getElementById('admObservacoes');
const admBtnSalvar = document.getElementById('admBtnSalvar');
const admFormMsg = document.getElementById('admFormMsg');
const admDataInput = { value: '' }; // "input" virtual (nao ha campo hidden aqui, guardamos so em JS)

let admHorarioSelecionado = null;
let servicosCarregados = false;

btnNovoAgendamento.addEventListener('click', abrirModal);
modalFechar.addEventListener('click', fecharModal);
modalOverlay.addEventListener('click', (e) => {
  if (e.target === modalOverlay) fecharModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !modalOverlay.hidden) fecharModal();
});

async function abrirModal() {
  modalOverlay.hidden = false;
  esconderMsgModal();
  formNovoAgendamento.reset();
  admDataInput.value = '';
  admDataTexto.textContent = 'Escolha uma data';
  admDataTexto.classList.remove('preenchido');
  admHorarioSelecionado = null;
  admSlotsContainer.innerHTML = '';
  admSlotsMsg.textContent = 'Selecione uma data para ver os horários disponíveis.';
  admSlotsMsg.style.display = 'block';

  if (!servicosCarregados) {
    try {
      const resp = await fetch('/api/servicos');
      const servicos = await resp.json();
      admServico.innerHTML =
        '<option value="" disabled selected>Escolha um serviço</option>' +
        servicos.map((s) => `<option value="${s.id}">${s.nome} — ${s.duracaoMin} min</option>`).join('');
      servicosCarregados = true;
    } catch (erro) {
      admServico.innerHTML = '<option value="" disabled selected>Erro ao carregar serviços</option>';
    }
  }
}

function fecharModal() {
  modalOverlay.hidden = true;
}

function esconderMsgModal() {
  admFormMsg.className = 'form-msg';
  admFormMsg.textContent = '';
}

function mostrarMsgModal(tipo, texto) {
  admFormMsg.className = `form-msg ${tipo}`;
  admFormMsg.textContent = texto;
}

// ---- date picker do modal (independente do calendario do site publico) ----

const admDataBtn = document.getElementById('admDataBtn');
const admDataTexto = document.getElementById('admDataTexto');
const admDatePopover = document.getElementById('admDatePopover');
const admDateGrid = document.getElementById('admDateGrid');
const admMesAtualLabel = document.getElementById('admMesAtualLabel');
const admMesAnterior = document.getElementById('admMesAnterior');
const admMesProximo = document.getElementById('admMesProximo');

const DIAS_FECHADOS = [0]; // precisa bater com server.js

const hojeModal = new Date();
hojeModal.setHours(0, 0, 0, 0);
let admMesExibido = hojeModal.getMonth();
let admAnoExibido = hojeModal.getFullYear();

function formatarBR(ano, mes, dia) {
  return `${doisDigitos(dia)}/${doisDigitos(mes + 1)}/${ano}`;
}

function renderizarCalendarioModal() {
  admMesAtualLabel.textContent = `${MESES[admMesExibido]} ${admAnoExibido}`;

  const primeiroDiaSemana = new Date(admAnoExibido, admMesExibido, 1).getDay();
  const totalDias = new Date(admAnoExibido, admMesExibido + 1, 0).getDate();

  admDateGrid.innerHTML = '';

  for (let i = 0; i < primeiroDiaSemana; i++) {
    admDateGrid.appendChild(document.createElement('span'));
  }

  for (let dia = 1; dia <= totalDias; dia++) {
    const dataCelula = new Date(admAnoExibido, admMesExibido, dia);
    const diaSemana = dataCelula.getDay();
    const fechado = DIAS_FECHADOS.includes(diaSemana);
    const ehHoje = dataCelula.getTime() === hojeModal.getTime();
    const iso = formatarISO(admAnoExibido, admMesExibido, dia);
    const ehSelecionado = admDataInput.value === iso;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'date-dia';
    btn.textContent = dia;

    if (ehHoje) btn.classList.add('hoje');
    if (ehSelecionado) btn.classList.add('selecionado');

    // no admin, permitimos escolher dias fechados ou passados tambem
    // (ex: reagendar algo excepcionalmente), so o domingo fica desabilitado
    // por padrao pra evitar erro, mas pode ser liberado se precisar.
    if (fechado) {
      btn.disabled = true;
      btn.classList.add('indisponivel');
    } else {
      btn.addEventListener('click', () => selecionarDiaModal(dia));
    }

    admDateGrid.appendChild(btn);
  }
}

async function selecionarDiaModal(dia) {
  const iso = formatarISO(admAnoExibido, admMesExibido, dia);
  admDataInput.value = iso;
  admDataTexto.textContent = formatarBR(admAnoExibido, admMesExibido, dia);
  admDataTexto.classList.add('preenchido');
  admDatePopover.hidden = true;
  admDataBtn.setAttribute('aria-expanded', 'false');
  await carregarHorariosModal(iso);
}

admDataBtn.addEventListener('click', () => {
  if (admDatePopover.hidden) {
    admDatePopover.hidden = false;
    admDataBtn.setAttribute('aria-expanded', 'true');
    renderizarCalendarioModal();
  } else {
    admDatePopover.hidden = true;
    admDataBtn.setAttribute('aria-expanded', 'false');
  }
});

admMesAnterior.addEventListener('click', () => {
  admMesExibido -= 1;
  if (admMesExibido < 0) {
    admMesExibido = 11;
    admAnoExibido -= 1;
  }
  renderizarCalendarioModal();
});

admMesProximo.addEventListener('click', () => {
  admMesExibido += 1;
  if (admMesExibido > 11) {
    admMesExibido = 0;
    admAnoExibido += 1;
  }
  renderizarCalendarioModal();
});

document.addEventListener('click', (evento) => {
  if (!admDatePopover.hidden && !admDatePopover.contains(evento.target) && !admDataBtn.contains(evento.target)) {
    admDatePopover.hidden = true;
    admDataBtn.setAttribute('aria-expanded', 'false');
  }
});

// Reaproveita a rota publica de horarios (ja exclui os ocupados automaticamente).
// Como o admin pode escolher datas fora do funcionamento padrao, se a rota
// devolver vazio por "fechado" ainda mostramos os horarios padrao pra permitir
// o agendamento excepcional -- so avisamos que e fora do horario normal.
async function carregarHorariosModal(data) {
  admHorarioSelecionado = null;
  admSlotsContainer.innerHTML = '';
  admSlotsMsg.textContent = 'Buscando horários...';
  admSlotsMsg.style.display = 'block';

  try {
    const resp = await fetch(`/api/horarios?data=${data}`);
    const dados = await resp.json();

    let horarios = dados.horarios || [];
    let aviso = '';

    if (dados.motivo === 'fechado') {
      // gera a lista padrao (09h-20h) mesmo assim, ja que e um agendamento manual excepcional
      horarios = Array.from({ length: 12 }, (_, i) => `${String(9 + i).padStart(2, '0')}:00`);
      aviso = 'Esse dia normalmente é fechado — confirme com o cliente antes de agendar.';
    }

    if (horarios.length === 0 && dados.motivo !== 'fechado') {
      admSlotsMsg.textContent = 'Nenhum horário livre nesse dia.';
      return;
    }

    admSlotsMsg.style.display = aviso ? 'block' : 'none';
    if (aviso) admSlotsMsg.textContent = aviso;

    horarios.forEach((horario) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'slot-btn';
      btn.textContent = horario;
      btn.addEventListener('click', () => {
        admSlotsContainer.querySelectorAll('.slot-btn').forEach((b) => b.classList.remove('selecionado'));
        btn.classList.add('selecionado');
        admHorarioSelecionado = horario;
      });
      admSlotsContainer.appendChild(btn);
    });
  } catch (erro) {
    admSlotsMsg.textContent = 'Não foi possível carregar os horários.';
  }
}

formNovoAgendamento.addEventListener('submit', async (e) => {
  e.preventDefault();
  esconderMsgModal();

  const servicoId = admServico.value;
  const data = admDataInput.value;
  const nome = admNome.value.trim();
  const contato = admContato.value.trim();
  const observacoes = admObservacoes.value.trim();

  if (!servicoId || !data || !admHorarioSelecionado || !nome || !contato) {
    mostrarMsgModal('erro', 'Preencha o serviço, a data, o horário, o nome e o contato.');
    return;
  }

  admBtnSalvar.disabled = true;
  admBtnSalvar.textContent = 'Criando...';

  try {
    const resp = await fetch('/api/admin/agendamentos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-password': senhaAtual },
      body: JSON.stringify({ servicoId, data, horario: admHorarioSelecionado, nome, contato, observacoes })
    });

    const dados = await resp.json();

    if (!resp.ok) {
      mostrarMsgModal('erro', dados.erro || 'Não foi possível criar o agendamento.');
      return;
    }

    fecharModal();
    carregarAgendamentos(senhaAtual);
  } catch (erro) {
    mostrarMsgModal('erro', 'Erro de conexão. Tente novamente.');
  } finally {
    admBtnSalvar.disabled = false;
    admBtnSalvar.textContent = 'Criar agendamento';
  }
});

// tenta entrar automaticamente se ja tiver senha salva na sessao
if (senhaAtual) {
  carregarAgendamentos(senhaAtual).then((ok) => {
    if (ok) {
      telaLogin.style.display = 'none';
      telaPainel.style.display = 'block';
    }
  });
}
