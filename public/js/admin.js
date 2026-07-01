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
let filtroAtivo = 'todos';

senhaInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') tentarEntrar();
});
btnEntrar.addEventListener('click', tentarEntrar);

filtros.addEventListener('click', (e) => {
  const btn = e.target.closest('.filtro-btn');
  if (!btn) return;

  filtroAtivo = btn.dataset.filtro;
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
  if (filtroAtivo === 'todos') return true;
  if (filtroAtivo === 'cancelado_expirado') return a.status === 'cancelado' || a.status === 'expirado';
  return a.status === filtroAtivo;
}

function renderizarCards(agendamentos) {
  const visiveis = agendamentos.filter(passaNoFiltro);

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

      return `
        <div class="agendamento-card" data-id="${a.id}">
          <div class="card-topo">
            <div>
              <div class="card-quando">${formatarData(a.data)} às ${a.horario}</div>
              <div class="card-servico">${escapeHtml(a.servicoNome)}</div>
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
              ? `<div class="card-acoes"><button class="btn-cancelar" onclick="cancelarAgendamento('${a.id}')">Cancelar agendamento</button></div>`
              : ''
          }
        </div>
      `;
    })
    .join('');
}

async function cancelarAgendamento(id) {
  if (!confirm('Cancelar este agendamento?')) return;

  await fetch(`/api/admin/agendamentos/${id}`, {
    method: 'DELETE',
    headers: { 'x-admin-password': senhaAtual }
  });

  carregarAgendamentos(senhaAtual);
}

// tenta entrar automaticamente se ja tiver senha salva na sessao
if (senhaAtual) {
  carregarAgendamentos(senhaAtual).then((ok) => {
    if (ok) {
      telaLogin.style.display = 'none';
      telaPainel.style.display = 'block';
    }
  });
}
