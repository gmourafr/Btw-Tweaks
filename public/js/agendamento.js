const selectServico = document.getElementById('servico');
const inputData = document.getElementById('data');
const slotsContainer = document.getElementById('slotsContainer');
const slotsMsg = document.getElementById('slotsMsg');
const form = document.getElementById('formAgendamento');
const formMsg = document.getElementById('formMsg');
const btnEnviar = document.getElementById('btnEnviar');

let horarioSelecionado = null;

// ---------- Carrega os servicos no select ----------
async function carregarServicosNoSelect() {
  try {
    const resp = await fetch('/api/servicos');
    const servicos = await resp.json();

    selectServico.innerHTML =
      '<option value="" disabled selected>Escolha um serviço</option>' +
      servicos
        .map((s) => `<option value="${s.id}">${s.nome} — ${s.duracaoMin} min</option>`)
        .join('');
  } catch (erro) {
    selectServico.innerHTML = '<option value="" disabled selected>Erro ao carregar serviços</option>';
  }
}

carregarServicosNoSelect();

// ---------- Busca horarios disponiveis quando a data muda ----------
inputData.addEventListener('change', carregarHorarios);

async function carregarHorarios() {
  horarioSelecionado = null;
  slotsContainer.innerHTML = '';

  const data = inputData.value;
  if (!data) {
    slotsMsg.textContent = 'Selecione uma data para ver os horários disponíveis.';
    slotsMsg.style.display = 'block';
    return;
  }

  slotsMsg.textContent = 'Buscando horários...';
  slotsMsg.style.display = 'block';

  try {
    const resp = await fetch(`/api/horarios?data=${data}`);
    const dados = await resp.json();

    if (dados.motivo === 'fechado') {
      slotsMsg.textContent = 'Fechado nesse dia. Escolha outra data.';
      return;
    }

    if (!dados.horarios || dados.horarios.length === 0) {
      slotsMsg.textContent = 'Nenhum horário livre nesse dia. Tente outra data.';
      return;
    }

    slotsMsg.style.display = 'none';

    dados.horarios.forEach((horario) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'slot-btn';
      btn.textContent = horario;
      btn.addEventListener('click', () => selecionarHorario(btn, horario));
      slotsContainer.appendChild(btn);
    });
  } catch (erro) {
    slotsMsg.textContent = 'Não foi possível carregar os horários. Tente novamente.';
  }
}

function selecionarHorario(botaoClicado, horario) {
  document.querySelectorAll('.slot-btn').forEach((b) => b.classList.remove('selecionado'));
  botaoClicado.classList.add('selecionado');
  horarioSelecionado = horario;
}

// ---------- Envio do formulario ----------
form.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  esconderMsg();

  const servicoId = selectServico.value;
  const data = inputData.value;
  const nome = document.getElementById('nome').value.trim();
  const contato = document.getElementById('contato').value.trim();
  const observacoes = document.getElementById('observacoes').value.trim();

  if (!servicoId || !data || !horarioSelecionado || !nome || !contato) {
    mostrarMsg('erro', 'Preencha o serviço, a data, o horário, o nome e o contato antes de enviar.');
    return;
  }

  btnEnviar.disabled = true;
  btnEnviar.textContent = 'Enviando...';

  try {
    const resp = await fetch('/api/agendamentos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ servicoId, data, horario: horarioSelecionado, nome, contato, observacoes })
    });

    const dados = await resp.json();

    if (!resp.ok) {
      mostrarMsg('erro', dados.erro || 'Não foi possível concluir o agendamento.');
      if (resp.status === 409) {
        carregarHorarios();
      }
      btnEnviar.disabled = false;
      btnEnviar.textContent = 'Confirmar agendamento';
      return;
    }

    // guarda o id pra pagina de confirmacao conseguir consultar o status
    sessionStorage.setItem('btw_ultimo_agendamento', dados.agendamento.id);

    mostrarMsg('sucesso', 'Horário reservado! Redirecionando para o pagamento...');
    window.location.href = dados.checkoutUrl;
  } catch (erro) {
    mostrarMsg('erro', 'Erro de conexão. Verifique sua internet e tente novamente.');
    btnEnviar.disabled = false;
    btnEnviar.textContent = 'Confirmar agendamento';
  }
});

function mostrarMsg(tipo, texto) {
  formMsg.className = `form-msg ${tipo}`;
  formMsg.textContent = texto;
}

function esconderMsg() {
  formMsg.className = 'form-msg';
  formMsg.textContent = '';
}
