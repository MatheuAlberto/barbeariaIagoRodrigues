/**
 * Topologia: Grafo Acíclico Direcionado (DOM) + Firebase Realtime Database (BaaS Real)
 * Locks de horário são agora compartilhados entre TODOS os clientes em tempo real.
 *
 * SETUP NECESSÁRIO:
 * 1. Acesse https://console.firebase.google.com
 * 2. Crie um projeto → Realtime Database → Modo de teste (regras abertas por 30 dias)
 * 3. Substitua o objeto `firebaseConfig` abaixo com os dados do seu projeto
 * 4. Adicione o script do Firebase SDK no seu index.html ANTES deste script:
 *
 *    <script type="module" src="script.js"></script>
 *
 *    (Este arquivo já usa ES Modules para importar o Firebase)
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase, ref, get, set, update, remove, onValue } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

// ─── 🔥 SUBSTITUA AQUI com os dados do seu projeto Firebase ───────────────────
const firebaseConfig = {
  apiKey: "SUA_API_KEY",
  authDomain: "SEU_PROJETO.firebaseapp.com",
  databaseURL: "https://SEU_PROJETO-default-rtdb.firebaseio.com",
  projectId: "SEU_PROJETO",
  storageBucket: "SEU_PROJETO.appspot.com",
  messagingSenderId: "SEU_SENDER_ID",
  appId: "SEU_APP_ID"
};
// ─────────────────────────────────────────────────────────────────────────────

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// ─── Constantes ───────────────────────────────────────────────────────────────
const URI_BASE = "https://wa.me/5596991896122?text=";
const HORARIOS_DISPONIVEIS = ["09:00", "10:00", "11:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00"];

// ─── Estado Local (por dispositivo) ──────────────────────────────────────────
let S_local = JSON.parse(localStorage.getItem('SOTA_CART')) || [];
let S_confirmados = JSON.parse(localStorage.getItem('SOTA_CONFIRMADOS')) || [];
let bufferInteracao = { servico: null, data: null, hora: null };

// Cache local do estado global (Firebase), atualizado em tempo real
let S_global_cache = {};

// ─── Sincronização em Tempo Real com Firebase ─────────────────────────────────
// Escuta mudanças no nó de locks e mantém cache local atualizado
const locksRef = ref(db, 'locks');
onValue(locksRef, (snapshot) => {
  S_global_cache = snapshot.val() || {};
  // Se o modal de seleção de hora estiver aberto, atualiza os botões imediatamente
  const grid = document.getElementById('sota-grid-horas');
  const inputData = document.getElementById('sota-input-data');
  if (grid && inputData && inputData.value) {
    renderizarBotoesHora(inputData.value, grid);
  }
});

// ─── Persistência Local ───────────────────────────────────────────────────────
const syncLocal = () => localStorage.setItem('SOTA_CART', JSON.stringify(S_local));
const syncConfirmados = () => localStorage.setItem('SOTA_CONFIRMADOS', JSON.stringify(S_confirmados));

// ─── Lock / Unlock no Firebase ────────────────────────────────────────────────

/**
 * Tenta bloquear um horário no Firebase de forma atômica.
 * Retorna true se conseguiu o lock, false se já estava ocupado.
 */
const tentarLock = async (data, hora) => {
  const slotRef = ref(db, `locks/${data}/${hora.replace(':', '-')}`);
  const snapshot = await get(slotRef);
  if (snapshot.exists()) return false; // já bloqueado
  await set(slotRef, { bloqueadoEm: Date.now() });
  return true;
};

/**
 * Libera um horário no Firebase.
 */
const liberarLock = async (data, hora) => {
  const slotRef = ref(db, `locks/${data}/${hora.replace(':', '-')}`);
  await remove(slotRef);
};

// ─── Verificação de Lock (via cache local) ────────────────────────────────────
const isHorarioBloqueado = (data, hora) => {
  const chave = hora.replace(':', '-');
  return !!(S_global_cache[data] && S_global_cache[data][chave]);
};

// ─── Renderização dos Botões de Hora ─────────────────────────────────────────
const renderizarBotoesHora = (dataStr, gridEl) => {
  const [ano, mes, dia] = dataStr.split('-').map(Number);
  const T_now = Date.now();
  const BUFFER_MS = 15 * 60 * 1000;

  // Preserva seleção atual
  const horaSelecionada = bufferInteracao.hora;

  gridEl.innerHTML = HORARIOS_DISPONIVEIS.map(horaStr => {
    const [h, m] = horaStr.split(':').map(Number);
    const T_slot = new Date(ano, mes - 1, dia, h, m, 0, 0).getTime();
    const isPassado = T_slot <= (T_now + BUFFER_MS);
    const isOcupado = isHorarioBloqueado(dataStr, horaStr);
    const desabilitado = (isPassado || isOcupado) ? 'disabled' : '';
    const selecionado = (horaStr === horaSelecionada) ? 'selecionado' : '';
    return `<button class="sota-btn-hora ${selecionado}" data-hora="${horaStr}" ${desabilitado}>${horaStr}</button>`;
  }).join('');
};

// ─── DOM Helpers ──────────────────────────────────────────────────────────────
const inicializarToastContainer = () => {
  let container = document.getElementById('sota-toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'sota-toast-container';
    document.body.appendChild(container);
  }
  return container;
};

const dispararAlertaSOTA = (mensagem, cor = 'red') => {
  const container = inicializarToastContainer();
  const toast = document.createElement('div');
  toast.className = 'sota-toast';
  toast.style.borderLeftColor = cor;
  toast.textContent = mensagem;
  container.appendChild(toast);
  requestAnimationFrame(() => requestAnimationFrame(() => toast.classList.add('ativo')));
  setTimeout(() => {
    toast.classList.remove('ativo');
    toast.addEventListener('transitionend', () => toast.remove());
  }, 3500);
};

const renderizarOverlay = () => {
  let overlay = document.getElementById('sota-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'sota-overlay';
    overlay.className = 'sota-overlay';
    document.body.appendChild(overlay);
  }
  return overlay;
};

const fecharModal = () => {
  const overlay = document.getElementById('sota-overlay');
  if (overlay) {
    overlay.classList.remove('ativo');
    setTimeout(() => overlay.innerHTML = '', 300);
  }
};

// ─── Modais ───────────────────────────────────────────────────────────────────
const abrirModalReserva = (nomeServico) => {
  bufferInteracao = { servico: nomeServico, data: null, hora: null };
  const overlay = renderizarOverlay();
  const hoje = new Date().toISOString().split('T')[0];

  overlay.innerHTML = `
    <div class="sota-modal">
      <h2>Agendar: ${nomeServico}</h2>
      <div class="sota-input-group">
        <label>Selecione o Dia:</label>
        <input type="date" id="sota-input-data" min="${hoje}">
      </div>
      <div class="pai-sota">
        <div class="sota-grid-horas" id="sota-grid-horas"></div>
      </div>
      <button class="sota-btn-acao" id="sota-btn-adicionar" disabled>Adicionar ao Agendamento</button>
      <button class="sota-btn-acao secundario" id="sota-btn-cancelar">Cancelar</button>
    </div>
  `;

  requestAnimationFrame(() => overlay.classList.add('ativo'));
};

const formatarData = (dataStr) => {
  const [y, m, d] = dataStr.split('-');
  return `${d}/${m}/${y}`;
};

const abrirModalCarrinho = () => {
  const overlay = renderizarOverlay();
  const hoje = new Date().toISOString().split('T')[0];
  const confirmadosValidos = S_confirmados.filter(item => item.data >= hoje);

  const htmlItens = S_local.length === 0
    ? `<p style="text-align:center;font-size:clamp(0.313rem,3dvw,1.5rem);padding:10px 0;color:#666;">Nenhum agendamento no cache.</p>`
    : S_local.map((item, index) => `
      <div class="sota-cart-item">
        <div>
          <strong>${item.servico}</strong><br>
          <small>${formatarData(item.data)} às ${item.hora}</small>
        </div>
        <button class="sota-btn-excluir" data-index="${index}">×</button>
      </div>
    `).join('');

  const htmlConfirmados = confirmadosValidos.length === 0
    ? `<p style="text-align:center;font-size:clamp(0.313rem,3dvw,1.5rem);color:#666;padding:10px 0;">Nenhum agendamento confirmado ativo.</p>`
    : confirmadosValidos.map(item => `
      <div class="sota-cart-item sota-confirmado-item">
        <div>
          <strong>${item.servico}</strong><br>
          <small>${formatarData(item.data)} às ${item.hora}</small><br>
          <span style="font-size:0.7rem;color:#28a745;font-weight:bold;">✓ CONFIRMADO</span>
        </div>
        <button class="sota-btn-cancelar-confirmado" data-id="${item.id}"
          style="background:transparent;color:#e53935;font-size:0.8rem;cursor:pointer;border:1px solid #e53935;border-radius:4px;padding:4px 8px;font-weight:bold;">
          Cancelar
        </button>
      </div>
    `).join('');

  overlay.innerHTML = `
    <div class="sota-modal">
      <h2>Meus Agendamentos</h2>
      <div style="font-size:clamp(0.5rem,3dvw,1.5rem);font-weight:800;color:#ff6607;text-transform:uppercase;margin-bottom:4px;">
        🛒 Pendentes de Confirmação
      </div>
      <div style="display:flex;flex-direction:column;gap:10px;max-height:30vh;overflow-y:auto;">
        ${htmlItens}
      </div>
      <div style="font-size:clamp(0.5rem,3dvw,1.5rem);font-weight:800;color:#28a745;text-transform:uppercase;">
        ✅ Confirmados
      </div>
      <div id="lista-confirmados" style="display:flex;flex-direction:column;gap:10px;max-height:30vh;overflow-y:auto;">
        ${htmlConfirmados}
      </div>
      <button class="sota-btn-acao" id="sota-btn-confirmar-zap" ${S_local.length === 0 ? 'disabled' : ''}>Confirmar no WhatsApp</button>
      <button class="sota-btn-acao secundario" id="sota-btn-cancelar">Fechar</button>
    </div>
  `;

  requestAnimationFrame(() => overlay.classList.add('ativo'));
};

const abrirModalCancelarConfirmado = (itemId) => {
  const item = S_confirmados.find(i => i.id === itemId);
  if (!item) return;
  const overlay = renderizarOverlay();
  overlay.innerHTML = `
    <div class="sota-modal" style="max-width:400px;">
      <h2>Cancelar Agendamento</h2>
      <div style="background:#fff3f3;border-left:4px solid #e53935;padding:15px;border-radius:6px;font-size:clamp(0.6rem,2.5dvw,1rem);">
        <strong>${item.servico}</strong><br>
        📅 ${formatarData(item.data)} às ${item.hora}
      </div>
      <p style="font-size:clamp(0.5rem,2dvw,0.9rem);color:#555;text-align:center;">
        Tem certeza que deseja cancelar este agendamento?<br>
        <span style="color:#e53935;font-weight:bold;">O horário será liberado para outros clientes.</span>
      </p>
      <button class="sota-btn-acao" id="sota-btn-confirmar-cancelamento" data-id="${item.id}" style="background:#e53935;">
        Sim, Cancelar Agendamento
      </button>
      <button class="sota-btn-acao secundario" id="sota-btn-voltar-carrinho">Não, Voltar</button>
    </div>
  `;
  requestAnimationFrame(() => overlay.classList.add('ativo'));
};

// ─── Roteador de Eventos (Click) ──────────────────────────────────────────────
document.body.addEventListener('click', async (evento) => {
  const alvo = evento.target;

  // A. Reservar
  const botaoReservar = alvo.closest('button');
  if (botaoReservar && botaoReservar.id !== 'btn-rodape' && botaoReservar.textContent.includes('Reservar')) {
    let nomeServico = "Corte Padrão";
    const cluster = botaoReservar.closest('.conteiner-filhos-assinantes') || botaoReservar.closest('.conteiner-filhos-demais-cortes');
    if (cluster) nomeServico = cluster.querySelector('p')?.textContent?.trim() || nomeServico;
    abrirModalReserva(nomeServico);
    return;
  }

  // B. Meus Agendamentos
  if (alvo.closest('#btn-rodape')) {
    abrirModalCarrinho();
    return;
  }

  // C. Selecionar Horário
  if (alvo.classList.contains('sota-btn-hora')) {
    document.querySelectorAll('.sota-btn-hora').forEach(btn => btn.classList.remove('selecionado'));
    alvo.classList.add('selecionado');
    bufferInteracao.hora = alvo.dataset.hora;
    document.getElementById('sota-btn-adicionar').disabled = false;
    return;
  }

  // D. Adicionar ao Carrinho — tenta lock no Firebase
  if (alvo.id === 'sota-btn-adicionar') {
    const btnAdd = document.getElementById('sota-btn-adicionar');
    btnAdd.disabled = true;
    btnAdd.textContent = 'Verificando...';

    const conseguiu = await tentarLock(bufferInteracao.data, bufferInteracao.hora);

    if (!conseguiu) {
      dispararAlertaSOTA('⚠️ Horário já foi reservado por outro cliente! Escolha outro.', '#e53935');
      // Atualiza os botões para refletir o novo lock
      const grid = document.getElementById('sota-grid-horas');
      if (grid) renderizarBotoesHora(bufferInteracao.data, grid);
      bufferInteracao.hora = null;
      btnAdd.textContent = 'Adicionar ao Agendamento';
      return;
    }

    S_local.push({ id: Date.now(), ...bufferInteracao });
    syncLocal();

    dispararAlertaSOTA(`✓ Adicionado: ${bufferInteracao.servico}`, '#ff6607');
    fecharModal();
    return;
  }

  // E. Remover item do carrinho pendente → libera lock no Firebase
  if (alvo.classList.contains('sota-btn-excluir')) {
    const index = parseInt(alvo.dataset.index);
    const item = S_local[index];
    await liberarLock(item.data, item.hora);
    S_local.splice(index, 1);
    syncLocal();
    abrirModalCarrinho();
    return;
  }

  // F. Confirmar no WhatsApp
  if (alvo.id === 'sota-btn-confirmar-zap') {
    let payload = "Fala, mestre! Quero confirmar estes agendamentos:\n\n";
    S_local.forEach(x => {
      payload += `✂️ *${x.servico}*\n📅 Dia: ${formatarData(x.data)}\n⏰ Hora: ${x.hora}\n\n`;
      // Lock já está no Firebase — só move para confirmados locais
      S_confirmados.push({ ...x });
    });
    syncConfirmados();
    S_local = [];
    syncLocal();
    fecharModal();
    window.open(URI_BASE + encodeURIComponent(payload), '_blank');
    return;
  }

  // G. Cancelar confirmado → libera lock no Firebase
  if (alvo.classList.contains('sota-btn-cancelar-confirmado')) {
    abrirModalCancelarConfirmado(parseInt(alvo.dataset.id));
    return;
  }

  // H. Confirmar cancelamento
  if (alvo.id === 'sota-btn-confirmar-cancelamento') {
    const itemId = parseInt(alvo.dataset.id);
    const item = S_confirmados.find(i => i.id === itemId);
    if (item) {
      await liberarLock(item.data, item.hora);
      S_confirmados = S_confirmados.filter(i => i.id !== itemId);
      syncConfirmados();
      dispararAlertaSOTA(`🗑️ Agendamento de ${item.servico} cancelado. Horário liberado.`, '#e53935');
      const payload = `Olá! Preciso cancelar meu agendamento:\n\n✂️ *${item.servico}*\n📅 Dia: ${formatarData(item.data)}\n⏰ Hora: ${item.hora}\n\nPor favor, confirme o cancelamento. Obrigado!`;
      window.open(URI_BASE + encodeURIComponent(payload), '_blank');
    }
    fecharModal();
    return;
  }

  // I. Voltar ao carrinho
  if (alvo.id === 'sota-btn-voltar-carrinho') {
    abrirModalCarrinho();
    return;
  }

  // J. Fechar modal
  if (alvo.id === 'sota-btn-cancelar' || alvo.id === 'sota-overlay') {
    fecharModal();
    return;
  }
});

// ─── Roteador de Mutação (Inputs) ─────────────────────────────────────────────
document.body.addEventListener('change', (evento) => {
  const alvo = evento.target;
  if (alvo.id !== 'sota-input-data') return;

  const gridHoras = document.getElementById('sota-grid-horas');
  const btnAdd = document.getElementById('sota-btn-adicionar');
  btnAdd.disabled = true;
  bufferInteracao.hora = null;

  const [ano, mes, dia] = alvo.value.split('-').map(Number);
  const diaSemana = new Date(ano, mes - 1, dia).getDay();

  if (diaSemana === 0) {
    alert("Restrição: Domingos indisponíveis.");
    alvo.value = '';
    gridHoras.innerHTML = '';
    return;
  }

  bufferInteracao.data = alvo.value;
  renderizarBotoesHora(alvo.value, gridHoras);
});
