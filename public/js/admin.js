const telaLogin = document.getElementById('telaLogin');
const telaPainel = document.getElementById('telaPainel');
const senhaInput = document.getElementById('senhaAdmin');
const btnEntrar = document.getElementById('btnEntrar');
const loginMsg = document.getElementById('loginMsg');
const tabelaContainer = document.getElementById('tabelaContainer');

let senhaAtual = sessionStorage.getItem('btw_admin_senha') || '';

senhaInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') tentarEntrar();
});
btnEntrar.addEventListener('click', tentarEntrar);

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

    const agendamentos = await resp.json();
    renderizarTabela(agendamentos);
    return true;
  } catch (erro) {
    return false;
  }
}

function rotuloStatus(status) {
  const mapa = {
    confirmado: { texto: 'Pago', cor: 'var(--blue)' },
    pendente_pagamento: { texto: 'Aguardando pagamento', cor: 'var(--warn)' },
    cancelado: { texto: 'Cancelado', cor: 'var(--text-faint)' },
    expirado: { texto: 'Expirado', cor: 'var(--text-faint)' }
  };
  const info = mapa[status] || { texto: status, cor: 'var(--text-faint)' };
  return `<span style="color:${info.cor};font-family:var(--font-mono);font-size:12px;">${info.texto}</span>`;
}

function renderizarTabela(agendamentos) {
  if (agendamentos.length === 0) {
    tabelaContainer.innerHTML = '<p class="vazio">Nenhum agendamento ainda.</p>';
    return;
  }

  const linhas = agendamentos
    .map(
      (a) => `
      <tr data-id="${a.id}">
        <td class="mono">${a.data} ${a.horario}</td>
        <td>${a.servicoNome}</td>
        <td>${a.nome}</td>
        <td class="mono">${a.contato}</td>
        <td>${rotuloStatus(a.status)}</td>
        <td><button class="btn-cancelar" onclick="cancelarAgendamento('${a.id}')">Cancelar</button></td>
      </tr>
    `
    )
    .join('');

  tabelaContainer.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Quando</th>
          <th>Serviço</th>
          <th>Nome</th>
          <th>Contato</th>
          <th>Pagamento</th>
          <th></th>
        </tr>
      </thead>
      <tbody>${linhas}</tbody>
    </table>
  `;
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
