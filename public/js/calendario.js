(function () {
  const inputData = document.getElementById('data');
  const dataBtn = document.getElementById('dataBtn');
  const dataTexto = document.getElementById('dataTexto');
  const popover = document.getElementById('datePopover');
  const grid = document.getElementById('dateGrid');
  const mesAtualLabel = document.getElementById('mesAtualLabel');
  const btnMesAnterior = document.getElementById('mesAnterior');
  const btnMesProximo = document.getElementById('mesProximo');

  // precisa bater com DIAS_FECHADOS no server.js (0 = domingo)
  const DIAS_FECHADOS = [0];

  const MESES = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];

  // "hoje" sempre pelo horario local do navegador da pessoa, sem passar por UTC
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  let mesExibido = hoje.getMonth();
  let anoExibido = hoje.getFullYear();
  let dataSelecionada = null;

  function doisDigitos(n) {
    return String(n).padStart(2, '0');
  }

  function formatarISO(ano, mes, dia) {
    return `${ano}-${doisDigitos(mes + 1)}-${doisDigitos(dia)}`;
  }

  function formatarBR(ano, mes, dia) {
    return `${doisDigitos(dia)}/${doisDigitos(mes + 1)}/${ano}`;
  }

  function renderizarCalendario() {
    mesAtualLabel.textContent = `${MESES[mesExibido]} ${anoExibido}`;

    const primeiroDiaSemana = new Date(anoExibido, mesExibido, 1).getDay();
    const totalDias = new Date(anoExibido, mesExibido + 1, 0).getDate();

    grid.innerHTML = '';

    for (let i = 0; i < primeiroDiaSemana; i++) {
      grid.appendChild(document.createElement('span'));
    }

    for (let dia = 1; dia <= totalDias; dia++) {
      const dataCelula = new Date(anoExibido, mesExibido, dia);
      const diaSemana = dataCelula.getDay();
      const passado = dataCelula < hoje;
      const fechado = DIAS_FECHADOS.includes(diaSemana);
      const ehHoje = dataCelula.getTime() === hoje.getTime();
      const ehSelecionado =
        dataSelecionada &&
        dataSelecionada.ano === anoExibido &&
        dataSelecionada.mes === mesExibido &&
        dataSelecionada.dia === dia;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'date-dia';
      btn.textContent = dia;

      if (ehHoje) btn.classList.add('hoje');
      if (ehSelecionado) btn.classList.add('selecionado');

      if (passado || fechado) {
        btn.disabled = true;
        btn.classList.add('indisponivel');
        btn.setAttribute('aria-label', `${dia} de ${MESES[mesExibido]}, indisponível`);
      } else {
        btn.addEventListener('click', () => selecionarDia(dia));
      }

      grid.appendChild(btn);
    }

    btnMesAnterior.disabled = anoExibido === hoje.getFullYear() && mesExibido === hoje.getMonth();
  }

  function selecionarDia(dia) {
    dataSelecionada = { ano: anoExibido, mes: mesExibido, dia };
    inputData.value = formatarISO(anoExibido, mesExibido, dia);
    dataTexto.textContent = formatarBR(anoExibido, mesExibido, dia);
    dataTexto.classList.add('preenchido');
    inputData.dispatchEvent(new Event('change'));
    fecharPopover();
  }

  function abrirPopover() {
    popover.hidden = false;
    dataBtn.setAttribute('aria-expanded', 'true');
    renderizarCalendario();
  }

  function fecharPopover() {
    popover.hidden = true;
    dataBtn.setAttribute('aria-expanded', 'false');
  }

  dataBtn.addEventListener('click', () => {
    if (popover.hidden) {
      abrirPopover();
    } else {
      fecharPopover();
    }
  });

  btnMesAnterior.addEventListener('click', () => {
    mesExibido -= 1;
    if (mesExibido < 0) {
      mesExibido = 11;
      anoExibido -= 1;
    }
    renderizarCalendario();
  });

  btnMesProximo.addEventListener('click', () => {
    mesExibido += 1;
    if (mesExibido > 11) {
      mesExibido = 0;
      anoExibido += 1;
    }
    renderizarCalendario();
  });

  document.addEventListener('click', (evento) => {
    if (!popover.hidden && !popover.contains(evento.target) && !dataBtn.contains(evento.target)) {
      fecharPopover();
    }
  });

  document.addEventListener('keydown', (evento) => {
    if (evento.key === 'Escape' && !popover.hidden) {
      fecharPopover();
      dataBtn.focus();
    }
  });
})();
