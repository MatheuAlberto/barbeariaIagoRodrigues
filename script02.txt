/**
 * Topologia: Grafo Acíclico Direcionado (DOM) + Mutex Simulado (BaaS Mock)
 * Complexidade de Eventos: O(1) Listener Ocupando Heap
 * Estado Global: Serializado em Árvore JSON Local (Simulando Endpoint Distribuído)
 */
(function() {
    "use strict";

    // 1. Definição do Espaço Topológico e Variáveis de Estado
    const URI_BASE = "https://wa.me/5596991896122?text=";
    const HORARIOS_DISPONIVEIS = ["09:00", "10:00", "11:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00"];
    
    // Vetores de Estado Síncrono
    let S_local = JSON.parse(localStorage.getItem('SOTA_CART')) || [];
    let S_global = JSON.parse(localStorage.getItem('SOTA_GLOBAL_LOCKS')) || {}; 
    // NOVO: Vetor de agendamentos confirmados (enviados pelo WhatsApp)
    let S_confirmados = JSON.parse(localStorage.getItem('SOTA_CONFIRMADOS')) || [];
    let bufferInteracao = { servico: null, data: null, hora: null };

    // 2. Controladores de Persistência
    const syncLocal = () => localStorage.setItem('SOTA_CART', JSON.stringify(S_local));
    const syncGlobal = () => localStorage.setItem('SOTA_GLOBAL_LOCKS', JSON.stringify(S_global));
    const syncConfirmados = () => localStorage.setItem('SOTA_CONFIRMADOS', JSON.stringify(S_confirmados));

    // 3. Virtualização de DOM (Sub-rotinas Ephemeras)
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

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                toast.classList.add('ativo');
            });
        });

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

    // 4. Interface: Modal de Data e Hora
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

    // 5. Interface: Carrinho / Meus Agendamentos
    const abrirModalCarrinho = () => {
        const overlay = renderizarOverlay();
        
        // Conta agendamentos confirmados ainda válidos (data futura ou hoje)
        const hoje = new Date().toISOString().split('T')[0];
        const confirmadosValidos = S_confirmados.filter(item => item.data >= hoje);

        let htmlItens = S_local.length === 0 
            ? `<p style="text-align:center;font-size:clamp(0.313rem, 3dvw, 1.5rem);padding: 10px 0;
            color:#666;">Nenhum agendamento no cache.</p>` 
            : S_local.map((item, index) => `
                <div class="sota-cart-item">
                    <div>
                        <strong>${item.servico}</strong><br>
                        <small>${formatarData(item.data)} às ${item.hora}</small>
                    </div>
                    <button class="sota-btn-excluir" data-index="${index}">×</button>
                </div>
            `).join('');

        // Seção de agendamentos confirmados (canceláveis)
        let htmlConfirmados = confirmadosValidos.length === 0
            ? `<p style="text-align:center;font-size: clamp(0.313rem, 3dvw, 1.5rem);color:#666;padding:10px 0;">Nenhum agendamento confirmado ativo.</p>`
            : confirmadosValidos.map((item) => `
                <div class="sota-cart-item sota-confirmado-item">
                    <div>
                        <strong>${item.servico}</strong><br>
                        <small>${formatarData(item.data)} às ${item.hora}</small><br>
                        <span style="font-size:0.7rem;color:#28a745;font-weight:bold;">✓ CONFIRMADO</span>
                    </div>
                    <button class="sota-btn-cancelar-confirmado" data-id="${item.id}" style="background:transparent;color:#e53935;font-size:0.8rem;cursor:pointer;border:1px solid #e53935;border-radius:4px;padding:4px 8px;font-weight:bold;">
                        Cancelar
                    </button>
                </div>
            `).join('');

        overlay.innerHTML = `
            <div class="sota-modal">
                <h2>Meus Agendamentos</h2>

                <div style="font-size:clamp(0.5rem, 3dvw, 1.5rem);font-weight:800;color:#ff6607;text-transform:uppercase;margin-bottom:4px;">
                    🛒 Pendentes de Confirmação
                </div>
                <div style="display:flex;flex-direction:column;gap:10px;max-height:30vh;overflow-y:auto;">
                    ${htmlItens}
                </div>

                <div style="font-size:clamp(0.5rem, 3dvw, 1.5rem);font-weight:800;color:#28a745;text-transform:uppercase;">
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

    // Helper: formatar data YYYY-MM-DD → DD/MM/YYYY
    const formatarData = (dataStr) => {
        const [y, m, d] = dataStr.split('-');
        return `${d}/${m}/${y}`;
    };

    // NOVO: Abrir modal de confirmação de cancelamento
    const abrirModalCancelarConfirmado = (itemId) => {
        const item = S_confirmados.find(i => i.id === itemId);
        if (!item) return;

        const overlay = renderizarOverlay();
        overlay.innerHTML = `
            <div class="sota-modal" style="max-width:400px;">
                <h2>Cancelar Agendamento</h2>
                <div style="background:#fff3f3;border-left:4px solid #e53935;padding:15px;border-radius:6px;font-size:clamp(0.6rem, 2.5dvw, 1rem);">
                    <strong>${item.servico}</strong><br>
                    📅 ${formatarData(item.data)} às ${item.hora}
                </div>
                <p style="font-size:clamp(0.5rem, 2dvw, 0.9rem);color:#555;text-align:center;">
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

    // 6. Roteador de Eventos O(1)
    document.body.addEventListener('click', (evento) => {
        const alvo = evento.target;

        // A. Clique no botão de reservar
        const botaoReservar = alvo.closest('button');
        if (botaoReservar && botaoReservar.id !== 'btn-rodape' && botaoReservar.textContent.includes('Reservar')) {
            let nomeServico = "Corte Padrão";
            const cluster = botaoReservar.closest('.conteiner-filhos-assinantes') || botaoReservar.closest('.conteiner-filhos-demais-cortes');
            if (cluster) nomeServico = cluster.querySelector('p')?.textContent?.trim() || nomeServico;
            
            abrirModalReserva(nomeServico);
            return;
        }

        // B. Clique em "Meus Agendamentos"
        if (alvo.closest('#btn-rodape')) {
            abrirModalCarrinho();
            return;
        }

        // C. Seleção de Horário
        if (alvo.classList.contains('sota-btn-hora')) {
            document.querySelectorAll('.sota-btn-hora').forEach(btn => btn.classList.remove('selecionado'));
            alvo.classList.add('selecionado');
            bufferInteracao.hora = alvo.dataset.hora;
            document.getElementById('sota-btn-adicionar').disabled = false;
            return;
        }
        
        // D. Adicionar ao Carrinho
        if (alvo.id === 'sota-btn-adicionar') {
            if (!S_global[bufferInteracao.data]) S_global[bufferInteracao.data] = [];
            S_global[bufferInteracao.data].push(bufferInteracao.hora);
            syncGlobal();

            S_local.push({ id: Date.now(), ...bufferInteracao });
            syncLocal();
            
            dispararAlertaSOTA(`✓ Adicionado: ${bufferInteracao.servico}`, '#ff6607');
            fecharModal();
            return;
        }

        // E. Remover item do carrinho (pendente)
        if (alvo.classList.contains('sota-btn-excluir')) {
            const index = parseInt(alvo.dataset.index);
            const item = S_local[index];
            
            S_global[item.data] = (S_global[item.data] || []).filter(h => h !== item.hora);
            syncGlobal();

            S_local.splice(index, 1);
            syncLocal();
            abrirModalCarrinho();
            return;
        }

        // F. Confirmar no WhatsApp → move para S_confirmados
        if (alvo.id === 'sota-btn-confirmar-zap') {
            let payload = "Fala, mestre! Quero confirmar estes agendamentos:\n\n";
            S_local.forEach(x => {
                payload += `✂️ *${x.servico}*\n📅 Dia: ${formatarData(x.data)}\n⏰ Hora: ${x.hora}\n\n`;
                // Salva no vetor de confirmados (locks NÃO são liberados)
                S_confirmados.push({ ...x });
            });
            syncConfirmados();
            
            // Limpa carrinho local
            S_local = [];
            syncLocal();
            
            fecharModal();
            window.open(URI_BASE + encodeURIComponent(payload), '_blank');
            return;
        }

        // G. NOVO: Clique em "Cancelar" em um agendamento confirmado
        if (alvo.classList.contains('sota-btn-cancelar-confirmado')) {
            const itemId = parseInt(alvo.dataset.id);
            abrirModalCancelarConfirmado(itemId);
            return;
        }

        // H. NOVO: Confirmar o cancelamento definitivo
        if (alvo.id === 'sota-btn-confirmar-cancelamento') {
            const itemId = parseInt(alvo.dataset.id);
            const item = S_confirmados.find(i => i.id === itemId);

            if (item) {
                // Libera o lock global → horário disponível para outros
                S_global[item.data] = (S_global[item.data] || []).filter(h => h !== item.hora);
                syncGlobal();

                // Remove dos confirmados
                S_confirmados = S_confirmados.filter(i => i.id !== itemId);
                syncConfirmados();

                dispararAlertaSOTA(`🗑️ Agendamento de ${item.servico} cancelado. Horário liberado.`, '#e53935');

                // Envia mensagem de cancelamento via WhatsApp
                const payload = `Olá! Preciso cancelar meu agendamento:\n\n✂️ *${item.servico}*\n📅 Dia: ${formatarData(item.data)}\n⏰ Hora: ${item.hora}\n\nPor favor, confirme o cancelamento. Obrigado!`;
                window.open(URI_BASE + encodeURIComponent(payload), '_blank');
            }

            fecharModal();
            return;
        }

        // I. Voltar ao carrinho a partir da tela de cancelamento
        if (alvo.id === 'sota-btn-voltar-carrinho') {
            abrirModalCarrinho();
            return;
        }

        // J. Cancelamento geral / fechar overlay
        if (alvo.id === 'sota-btn-cancelar' || alvo.id === 'sota-overlay') {
            fecharModal();
            return;
        }
    });

    // 7. Roteador de Eventos de Mutação (Inputs)
    document.body.addEventListener('change', (evento) => {
        const alvo = evento.target;

        if (alvo.id === 'sota-input-data') {
            const gridHoras = document.getElementById('sota-grid-horas');
            const btnAdd = document.getElementById('sota-btn-adicionar');
            btnAdd.disabled = true;
            bufferInteracao.hora = null;

            const [ano, mes, dia] = alvo.value.split('-').map(Number);
            const dataSelecionada = new Date(ano, mes - 1, dia);
            const diaSemana = dataSelecionada.getDay();

            if (diaSemana === 0) {
                alert("Restrição: Domingos indisponíveis.");
                alvo.value = '';
                gridHoras.innerHTML = '';
                return;
            }

            bufferInteracao.data = alvo.value;

            const T_now = Date.now(); 
            const BUFFER_MS = 15 * 60 * 1000;
            const horasOcupadas = S_global[alvo.value] || [];

            gridHoras.innerHTML = HORARIOS_DISPONIVEIS.map(horaStr => {
                const [horaEscalar, minutoEscalar] = horaStr.split(':').map(Number);
                const dataBloco = new Date(ano, mes - 1, dia, horaEscalar, minutoEscalar, 0, 0);
                const T_slot = dataBloco.getTime();
                
                const isPassado = T_slot <= (T_now + BUFFER_MS);
                const isOcupado = horasOcupadas.includes(horaStr);
                const isBloqueado = (isPassado || isOcupado) ? 'disabled' : '';
                
                return `<button class="sota-btn-hora" data-hora="${horaStr}" ${isBloqueado}>${horaStr}</button>`;
            }).join('');
        }
    });

})();