const statusBadge = document.getElementById('statusBadge');
const statusTitulo = document.getElementById('statusTitulo');
const statusTexto = document.getElementById('statusTexto');
const detalhe = document.getElementById('detalhe');

const params = new URLSearchParams(window.location.search);
const agendamentoId =
  params.get('external_reference') || sessionStorage.getItem('btw_ultimo_agendamento');

const MAX_TENTATIVAS = 8;
const INTERVALO_MS = 2500;

function formatarData(iso) {
  const [ano, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${ano}`;
}

function mostrarEstado(tipo, icone, titulo, texto) {
  statusBadge.className = `status-badge ${tipo}`;
  statusBadge.textContent = icone;
  statusTitulo.textContent = titulo;
  statusTexto.textContent = texto;
}

function mostrarDetalhe(ag) {
  detalhe.style.display = 'block';
  detalhe.innerHTML = `serviço: ${ag.servicoNome}<br>data: ${formatarData(ag.data)}<br>horário: ${ag.horario}`;
}

async function consultarStatus(tentativa) {
  try {
    const resp = await fetch(`/api/agendamentos/${agendamentoId}/status`);
    if (!resp.ok) throw new Error('nao encontrado');

    const ag = await resp.json();

    if (ag.status === 'confirmado') {
      mostrarEstado('ok', '✓', 'Pagamento confirmado!', 'Seu horário está garantido. Vamos te chamar no contato informado para combinar o acesso remoto.');
      mostrarDetalhe(ag);
      return;
    }

    if (ag.status === 'cancelado') {
      mostrarEstado('erro', '!', 'Pagamento não aprovado', 'O pagamento foi recusado ou cancelado. Você pode tentar agendar de novo.');
      return;
    }

    if (ag.status === 'expirado') {
      mostrarEstado('erro', '!', 'Tempo de pagamento esgotado', 'O horário foi liberado de novo. Faça um novo agendamento quando quiser.');
      return;
    }

    // ainda pendente_pagamento — tenta de novo em instantes
    if (tentativa < MAX_TENTATIVAS) {
      setTimeout(() => consultarStatus(tentativa + 1), INTERVALO_MS);
    } else {
      mostrarEstado('espera', '…', 'Pagamento em análise', 'Pode levar mais alguns minutos. Assim que for aprovado, seu horário fica confirmado automaticamente.');
      mostrarDetalhe(ag);
    }
  } catch (erro) {
    mostrarEstado('erro', '!', 'Não encontramos esse agendamento', 'Se você concluiu um pagamento, aguarde alguns instantes e atualize a página.');
  }
}

if (!agendamentoId) {
  mostrarEstado('erro', '!', 'Nada por aqui', 'Não encontramos um agendamento em andamento.');
} else {
  consultarStatus(0);
}
