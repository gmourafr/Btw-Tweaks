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

function formatarPreco(valor) {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

async function carregarServicosNaGrid() {
  try {
    const resp = await fetch('/api/servicos');
    const servicos = await resp.json();

    servicosGrid.innerHTML = servicos
      .map(
        (s) => `
        <article class="servico-card">
          <h3>${s.nome}</h3>
          <p>${s.descricao}</p>
          <div class="servico-meta">
            <span><strong>${s.duracaoMin} min</strong></span>
            <span><strong>${formatarPreco(s.preco)}</strong></span>
          </div>
        </article>
      `
      )
      .join('');
  } catch (erro) {
    servicosGrid.innerHTML = '<p>Não foi possível carregar os serviços agora. Atualize a página.</p>';
  }
}

carregarServicosNaGrid();
