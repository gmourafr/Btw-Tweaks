// ---------- Ano no rodape ----------
document.getElementById('anoAtual').textContent = new Date().getFullYear();

// ---------- Menu mobile ----------
const navToggle = document.getElementById('navToggle');
const navLinks = document.getElementById('navLinks');

navToggle.addEventListener('click', () => {
  const aberto = navLinks.classList.toggle('aberto');
  navToggle.setAttribute('aria-expanded', aberto ? 'true' : 'false');
});

navLinks.querySelectorAll('a').forEach((link) => {
  link.addEventListener('click', () => {
    navLinks.classList.remove('aberto');
    navToggle.setAttribute('aria-expanded', 'false');
  });
});

// ---------- Animacao do painel de diagnostico ----------
const reduzMovimento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const terminal = document.getElementById('terminalDiagnostico');

if (terminal) {
  if (reduzMovimento) {
    terminal.classList.add('applied');
  } else {
    setTimeout(() => terminal.classList.add('applied'), 1400);
  }
}

// ---------- Cards de servico (puxados da API) ----------
const servicosGrid = document.getElementById('servicosGrid');

function formatarPrecoPartes(valor) {
  const partes = valor.toFixed(2).split('.');
  return { inteiro: partes[0], centavos: partes[1] };
}

const iconeCheck = `
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M3 8.5L6.2 11.5L13 4.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>
`;

async function carregarServicosNaGrid() {
  try {
    const resp = await fetch('/api/servicos');
    const servicos = await resp.json();

    servicosGrid.innerHTML = servicos
      .map((s) => {
        const preco = formatarPrecoPartes(s.preco);
        const itensHtml = (s.itens || [])
          .map((item) => `<li>${iconeCheck}<span>${item}</span></li>`)
          .join('');

        return `
        <article class="servico-card${s.destaque ? ' destaque' : ''}">
          ${s.destaque ? '<span class="servico-badge">Mais completo</span>' : ''}
          <h3>${s.nome}</h3>
          <p class="servico-tagline">${s.descricao}</p>

          <div class="servico-preco">
            <span class="servico-preco-moeda">R$</span>
            <span class="servico-preco-valor">${preco.inteiro}</span>
            <span class="servico-preco-centavos">,${preco.centavos}</span>
            <span class="servico-preco-duracao">~${s.duracaoMin} min</span>
          </div>

          <ul class="servico-itens">${itensHtml}</ul>

          <a href="#agendamento" class="btn ${s.destaque ? 'btn-primary' : 'btn-secondary'} servico-cta" data-servico-id="${s.id}">Agendar esse plano</a>
        </article>
      `;
      })
      .join('');

    servicosGrid.querySelectorAll('.servico-cta').forEach((link) => {
      link.addEventListener('click', () => {
        const select = document.getElementById('servico');
        if (select && select.querySelector(`option[value="${link.dataset.servicoId}"]`)) {
          select.value = link.dataset.servicoId;
          select.dispatchEvent(new Event('change'));
        }
      });
    });
  } catch (erro) {
    servicosGrid.innerHTML = '<p>Não foi possível carregar os serviços agora. Atualize a página.</p>';
  }
}

carregarServicosNaGrid();

// ---------- Animacao de entrada ao rolar ate a secao Quem Somos ----------
const elementosReveal = document.querySelectorAll('.reveal');

if (elementosReveal.length && !reduzMovimento) {
  const observer = new IntersectionObserver(
    (entradas) => {
      entradas.forEach((entrada, indice) => {
        if (entrada.isIntersecting) {
          setTimeout(() => entrada.target.classList.add('visivel'), indice * 90);
          observer.unobserve(entrada.target);
        }
      });
    },
    { threshold: 0.2 }
  );

  elementosReveal.forEach((el) => observer.observe(el));
} else {
  elementosReveal.forEach((el) => el.classList.add('visivel'));
}
