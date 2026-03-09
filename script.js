/**
 * Barbearia Rodrigues — Sistema de Agendamento
 * ─────────────────────────────────────────────
 * Estado compartilhado via JSONBin.io (grátis, sem conta necessária para ler).
 *
 * ⚙️  CONFIGURAÇÃO INICIAL (faça isso uma vez):
 *  1. Acesse https://jsonbin.io e crie uma conta gratuita.
 *  2. Clique em "Create Bin" e cole o JSON inicial:  {}
 *  3. Copie o "BIN ID" gerado (ex: 6650abc123def...)
 *  4. Vá em Account > API Keys, copie sua "$master-key" ou "$access-key".
 *  5. Substitua BIN_ID e API_KEY abaixo.
 *
 * Como funciona:
 *  - Cada vez que um usuário seleciona uma data, o script lê os horários
 *    ocupados do JSONBin (compartilhado entre todos os dispositivos).
 *  - Ao adicionar ao carrinho, o horário é gravado imediatamente no bin,
 *    ficando indisponível para qualquer outro usuário em tempo real.
 *  - Ao cancelar, o horário é liberado de volta no bin.
 */
(function () {
  "use strict";

  // ── ⚙️  CONFIGURAÇÃO — ALTERE AQUI ──────────────────────────────────────────
  const BIN_ID  = "69aed36dd0ea881f400087c4";
  const API_KEY = "$2a$10$.kYVguhFJPh01LRN3iDO.efXXcezFJTOR0vjwT2D4xPh3yvQyuBNy";

  const URI_WHATSAPP = "https://wa.me/5596991896122?text=";
  const HORARIOS = ["09:00","10:00","11:00","14:00","15:00","16:00","17:00","18:00","19:00"];
  const BIN_URL  = `https://api.jsonbin.io/v3/b/${BIN_ID}`;

  // ── ESTADO LOCAL ─────────────────────────────────────────────────────────────
  let S_local       = JSON.parse(localStorage.getItem("SOTA_CART"))       || [];
  let S_confirmados = JSON.parse(localStorage.getItem("SOTA_CONFIRMADOS")) || [];
  let S_global      = {};   // cache dos locks compartilhados
  let bufferInteracao = { servico: null, data: null, hora: null };

  const syncLocal       = () => localStorage.setItem("SOTA_CART",       JSON.stringify(S_local));
  const syncConfirmados = () => localStorage.setItem("SOTA_CONFIRMADOS", JSON.stringify(S_confirmados));

  // ── JSONBIN HELPERS ──────────────────────────────────────────────────────────

  /** Lê o bin completo: { "YYYY-MM-DD": ["HH:MM", ...] } */
  const binRead = async () => {
    try {
      const res = await fetch(`${BIN_URL}/latest`, {
        headers: {
          "X-Master-Key": API_KEY,
          "X-Bin-Meta": "false",
        },
      });
      const json = await res.json();
      return json.record || json || {};
    } catch { return {}; }
  };

  /** Escreve o objeto completo de volta no bin */
  const binWrite = async (data) => {
    try {
      await fetch(BIN_URL, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-Master-Key": API_KEY,
        },
        body: JSON.stringify(data),
      });
    } catch (e) { console.error("JSONBin write error:", e); }
  };

  /**
   * Tenta adquirir lock para (data, hora).
   * Retorna true se conseguiu, false se já ocupado.
   */
  const adquirirLock = async (data, hora) => {
    const estado = await binRead();
    S_global = estado;
    const ocupados = estado[data] || [];
    if (ocupados.includes(hora)) return false;
    ocupados.push(hora);
    estado[data] = ocupados;
    await binWrite(estado);
    S_global = estado;
    return true;
  };

  /** Libera lock de (data, hora) */
  const liberarLock = async (data, hora) => {
    const estado = await binRead();
    estado[data] = (estado[data] || []).filter(h => h !== hora);
    if (estado[data].length === 0) delete estado[data];
    await binWrite(estado);
    S_global = estado;
  };

  // ── TOAST ─────────────────────────────────────────────────────────────────────
  const inicializarToastContainer = () => {
    let c = document.getElementById("sota-toast-container");
    if (!c) {
      c = document.createElement("div");
      c.id = "sota-toast-container";
      document.body.appendChild(c);
    }
    return c;
  };

  const dispararAlertaSOTA = (mensagem, cor = "red") => {
    const container = inicializarToastContainer();
    const toast = document.createElement("div");
    toast.className = "sota-toast";
    toast.style.borderLeftColor = cor;
    toast.textContent = mensagem;
    container.appendChild(toast);
    requestAnimationFrame(() => requestAnimationFrame(() => toast.classList.add("ativo")));
    setTimeout(() => {
      toast.classList.remove("ativo");
      toast.addEventListener("transitionend", () => toast.remove(), { once: true });
    }, 3500);
  };

  // ── OVERLAY / MODAL ───────────────────────────────────────────────────────────
  const renderizarOverlay = () => {
    let ov = document.getElementById("sota-overlay");
    if (!ov) {
      ov = document.createElement("div");
      ov.id = "sota-overlay";
      ov.className = "sota-overlay";
      document.body.appendChild(ov);
    }
    return ov;
  };

  const fecharModal = () => {
    const ov = document.getElementById("sota-overlay");
    if (ov) {
      ov.classList.remove("ativo");
      setTimeout(() => (ov.innerHTML = ""), 300);
    }
  };

  const formatarData = (s) => {
    const [y, m, d] = s.split("-");
    return `${d}/${m}/${y}`;
  };

  // ── MODAL: RESERVAR ───────────────────────────────────────────────────────────
  const abrirModalReserva = (nomeServico) => {
    bufferInteracao = { servico: nomeServico, data: null, hora: null };
    const ov   = renderizarOverlay();
    const hoje = new Date().toISOString().split("T")[0];

    ov.innerHTML = `
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
      </div>`;

    requestAnimationFrame(() => ov.classList.add("ativo"));
  };

  // ── MODAL: CARRINHO ───────────────────────────────────────────────────────────
  const abrirModalCarrinho = () => {
    const ov   = renderizarOverlay();
    const hoje = new Date().toISOString().split("T")[0];
    const confirmadosValidos = S_confirmados.filter(i => i.data >= hoje);

    const htmlItens = S_local.length === 0
      ? `<p style="text-align:center;font-size:clamp(0.313rem,3dvw,1.5rem);padding:10px 0;color:#666;">Nenhum agendamento no cache.</p>`
      : S_local.map((item, idx) => `
          <div class="sota-cart-item">
            <div><strong>${item.servico}</strong><br><small>${formatarData(item.data)} às ${item.hora}</small></div>
            <button class="sota-btn-excluir" data-index="${idx}">×</button>
          </div>`).join("");

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
          </div>`).join("");

    ov.innerHTML = `
      <div class="sota-modal">
        <h2>Meus Agendamentos</h2>
        <div style="font-size:clamp(0.5rem,3dvw,1.5rem);font-weight:800;color:#1E5EFF;text-transform:uppercase;margin-bottom:4px;">
          🛒 Pendentes de Confirmação
        </div>
        <div style="display:flex;flex-direction:column;gap:10px;max-height:30vh;overflow-y:auto;">${htmlItens}</div>
        <div style="font-size:clamp(0.5rem,3dvw,1.5rem);font-weight:800;color:#28a745;text-transform:uppercase;">
          ✅ Confirmados
        </div>
        <div id="lista-confirmados" style="display:flex;flex-direction:column;gap:10px;max-height:30vh;overflow-y:auto;">
          ${htmlConfirmados}
        </div>
        <button class="sota-btn-acao" id="sota-btn-confirmar-zap" ${S_local.length === 0 ? "disabled" : ""}>
          Confirmar no WhatsApp
        </button>
        <button class="sota-btn-acao secundario" id="sota-btn-cancelar">Fechar</button>
      </div>`;

    requestAnimationFrame(() => ov.classList.add("ativo"));
  };

  // ── MODAL: CONFIRMAR CANCELAMENTO ─────────────────────────────────────────────
  const abrirModalCancelarConfirmado = (itemId) => {
    const item = S_confirmados.find(i => i.id === itemId);
    if (!item) return;
    const ov = renderizarOverlay();
    ov.innerHTML = `
      <div class="sota-modal" style="max-width:400px;">
        <h2>Cancelar Agendamento</h2>
        <div style="background:#fff3f3;border-left:4px solid #e53935;padding:15px;border-radius:6px;font-size:clamp(0.6rem,2.5dvw,1rem);">
          <strong>${item.servico}</strong><br>📅 ${formatarData(item.data)} às ${item.hora}
        </div>
        <p style="font-size:clamp(0.5rem,2dvw,0.9rem);color:#555;text-align:center;">
          Tem certeza que deseja cancelar?<br>
          <span style="color:#e53935;font-weight:bold;">O horário será liberado para outros clientes.</span>
        </p>
        <button class="sota-btn-acao" id="sota-btn-confirmar-cancelamento" data-id="${item.id}" style="background:#e53935;">
          Sim, Cancelar Agendamento
        </button>
        <button class="sota-btn-acao secundario" id="sota-btn-voltar-carrinho">Não, Voltar</button>
      </div>`;
    requestAnimationFrame(() => ov.classList.add("ativo"));
  };

  // ── RENDERIZAR GRADE DE HORAS ─────────────────────────────────────────────────
  const renderizarGradeHoras = async (dateStr) => {
    const grid   = document.getElementById("sota-grid-horas");
    const btnAdd = document.getElementById("sota-btn-adicionar");
    if (!grid) return;

    // Loading state
    grid.innerHTML = `<p style="font-size:clamp(0.5rem,2.5dvw,1rem);color:#888;text-align:center;padding:10px;width:100%;">
      ⏳ Verificando disponibilidade…</p>`;

    const estado = await binRead();
    S_global = estado;

    const [ano, mes, dia] = dateStr.split("-").map(Number);
    const T_now    = Date.now();
    const BUF_MS   = 0;
    const ocupados = estado[dateStr] || [];

    // Horários já no carrinho local (desta data)
    const reservadosLocais = S_local
      .filter(i => i.data === dateStr)
      .map(i => i.hora);

    grid.innerHTML = HORARIOS.map(hora => {
      const [h, m] = hora.split(":").map(Number);
      const T_slot = new Date(ano, mes - 1, dia, h, m).getTime();
      const bloqueado = T_slot <= T_now + BUF_MS
        || ocupados.includes(hora)
        || reservadosLocais.includes(hora);
      return `<button class="sota-btn-hora" data-hora="${hora}" ${bloqueado ? "disabled" : ""}>${hora}</button>`;
    }).join("");

    bufferInteracao.hora = null;
    if (btnAdd) btnAdd.disabled = true;
  };

  // ── ROTEADOR DE EVENTOS (click) ───────────────────────────────────────────────
  document.body.addEventListener("click", async (ev) => {
    const alvo = ev.target;

    // A. Botão Reservar
    const btn = alvo.closest("button");
    if (btn && btn.id !== "btn-rodape" && btn.textContent.includes("Reservar")) {
      const cluster = btn.closest(".conteiner-filhos-assinantes") || btn.closest(".conteiner-filhos-demais-cortes");
      const nomeServico = cluster?.querySelector("p")?.textContent?.trim() || "Corte Padrão";
      abrirModalReserva(nomeServico);
      return;
    }

    // B. Meus Agendamentos
    if (alvo.closest("#btn-rodape")) { abrirModalCarrinho(); return; }

    // C. Selecionar Horário
    if (alvo.classList.contains("sota-btn-hora")) {
      document.querySelectorAll(".sota-btn-hora").forEach(b => b.classList.remove("selecionado"));
      alvo.classList.add("selecionado");
      bufferInteracao.hora = alvo.dataset.hora;
      const btnAdd = document.getElementById("sota-btn-adicionar");
      if (btnAdd) btnAdd.disabled = false;
      return;
    }

    // D. Adicionar ao Carrinho — adquire lock compartilhado
    if (alvo.id === "sota-btn-adicionar") {
      const { servico, data, hora } = bufferInteracao;
      if (!servico || !data || !hora) return;

      alvo.disabled    = true;
      alvo.textContent = "⏳ Reservando…";

      const ok = await adquirirLock(data, hora);

      if (!ok) {
        dispararAlertaSOTA("⚠️ Esse horário acabou de ser reservado por outro cliente. Escolha outro.", "#e53935");
        await renderizarGradeHoras(data);   // Atualiza a grade com o novo estado
        return;
      }

      S_local.push({ id: Date.now(), ...bufferInteracao });
      syncLocal();
      dispararAlertaSOTA(`✓ ${servico} adicionado ao agendamento!`, "#ff6607");
      fecharModal();
      return;
    }

    // E. Remover item pendente do carrinho → libera lock
    if (alvo.classList.contains("sota-btn-excluir")) {
      const index = parseInt(alvo.dataset.index);
      const item  = S_local[index];
      await liberarLock(item.data, item.hora);
      S_local.splice(index, 1);
      syncLocal();
      abrirModalCarrinho();
      return;
    }

    // F. Confirmar no WhatsApp → move pendentes para confirmados
    if (alvo.id === "sota-btn-confirmar-zap") {
      let payload = "Olá! Tudo bom?\nGostaria de confirmar este agendamento. \u2702\uFE0F\n\n";
      S_local.forEach(x => {
        payload += `\u2702\uFE0F *${x.servico}*\n\uD83D\uDCC5 Data: ${formatarData(x.data)}\n\u23F0 Horário: ${x.hora}\n\n`;
        S_confirmados.push({ ...x });
      });
      syncConfirmados();
      S_local = [];
      syncLocal();
      fecharModal();
      window.open(URI_WHATSAPP + encodeURIComponent(payload), "_blank");
      return;
    }

    // G. Abrir modal de cancelamento de confirmado
    if (alvo.classList.contains("sota-btn-cancelar-confirmado")) {
      abrirModalCancelarConfirmado(parseInt(alvo.dataset.id));
      return;
    }

    // H. Confirmar cancelamento → libera lock
    if (alvo.id === "sota-btn-confirmar-cancelamento") {
      const itemId = parseInt(alvo.dataset.id);
      const item   = S_confirmados.find(i => i.id === itemId);
      if (item) {
        await liberarLock(item.data, item.hora);
        S_confirmados = S_confirmados.filter(i => i.id !== itemId);
        syncConfirmados();
        dispararAlertaSOTA(`🗑️ Agendamento de ${item.servico} cancelado. Horário liberado.`, "#e53935");
        const payload = `Ol\u00E1! Preciso cancelar meu agendamento:\n\n\u2702\uFE0F *${item.servico}*\n\uD83D\uDCC5 Data: ${formatarData(item.data)}\n\u23F0 Horário: ${item.hora}\n\nPor favor, confirme o cancelamento. Obrigado!`;
        window.open(URI_WHATSAPP + encodeURIComponent(payload), "_blank");
      }
      fecharModal();
      return;
    }

    // I. Voltar ao carrinho
    if (alvo.id === "sota-btn-voltar-carrinho") { abrirModalCarrinho(); return; }

    // J. Fechar modal
    if (alvo.id === "sota-btn-cancelar" || alvo.id === "sota-overlay") { fecharModal(); return; }
  });

  // ── EVENTO: Seleção de Data ───────────────────────────────────────────────────
  document.body.addEventListener("change", async (ev) => {
    const alvo = ev.target;
    if (alvo.id !== "sota-input-data") return;

    const btnAdd = document.getElementById("sota-btn-adicionar");
    if (btnAdd) btnAdd.disabled = true;
    bufferInteracao.hora = null;

    const [ano, mes, dia] = alvo.value.split("-").map(Number);
    if (new Date(ano, mes - 1, dia).getDay() === 0) {
      alert("Restrição: Domingos indisponíveis.");
      alvo.value = "";
      const grid = document.getElementById("sota-grid-horas");
      if (grid) grid.innerHTML = "";
      return;
    }

    bufferInteracao.data = alvo.value;
    await renderizarGradeHoras(alvo.value);
  });

  // ── INIT ──────────────────────────────────────────────────────────────────────
  binRead().then(d => { S_global = d; });

})();
