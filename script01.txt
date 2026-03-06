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
    let bufferInteracao = { servico: null, data: null, hora: null };

    // 2. Controladores de Persistência
    const syncLocal = () => localStorage.setItem('SOTA_CART', JSON.stringify(S_local));
    const syncGlobal = () => localStorage.setItem('SOTA_GLOBAL_LOCKS', JSON.stringify(S_global));

    // 3. Virtualização de DOM (Sub-rotinas Ephemeras)
    // 3.1. Sub-rotina Efêmera: Feedback Visuo-Motor Acelerado por Hardware
    const inicializarToastContainer = () => {
        let container = document.getElementById('sota-toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'sota-toast-container';
            document.body.appendChild(container);
        }
        return container;
    };

    const dispararAlertaSOTA = (mensagem) => {
        const container = inicializarToastContainer();
        const toast = document.createElement('div');
        
        toast.className = 'sota-toast';
        toast.textContent = `✓ Confirmado Meu Agendamento: ${mensagem}`;
        
        container.appendChild(toast);

        // Duplo requestAnimationFrame força o pipeline de renderização (Layout -> Paint -> Composite)
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                toast.classList.add('ativo');
            });
        });

        // Decaimento temporal: Destruição do nó em t = 3000ms
        setTimeout(() => {
            toast.classList.remove('ativo');
            toast.addEventListener('transitionend', () => toast.remove());
        }, 3000);
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
            setTimeout(() => overlay.innerHTML = '', 300); // Coleta de lixo da sub-árvore
        }
    };

    // 4. Interface Sensório-Motora: Modal de Data e Hora
    const abrirModalReserva = (nomeServico) => {
        bufferInteracao = { servico: nomeServico, data: null, hora: null };
        const overlay = renderizarOverlay();
        
        // Obter data mínima (hoje)
        const hoje = new Date().toISOString().split('T')[0];

        overlay.innerHTML = `
            <div class="sota-modal">
                <h2>Agendar: ${nomeServico}</h2>
                <div class="sota-input-group">
                    <label>Selecione o Dia:</label>
                    <input type="date" id="sota-input-data" min="${hoje}">
                </div>
                <div class="pai-sota">
                <div class="sota-grid-horas" id="sota-grid-horas">
                    </div>
                    </div>
                <button class="sota-btn-acao" id="sota-btn-adicionar" disabled>Adicionar ao Agendamento</button>
                <button class="sota-btn-acao secundario" id="sota-btn-cancelar">Cancelar</button>
            </div>
        `;
        
        requestAnimationFrame(() => overlay.classList.add('ativo'));
    };

    // 5. Interface Sensório-Motora: Carrinho / Meus Agendamentos
    const abrirModalCarrinho = () => {
        const overlay = renderizarOverlay();
        
        let htmlItens = S_local.length === 0 
            ? `<p style="text-align: center;
    display: flex;
    align-items: center;
    justify-content: center;
    height: 10vh;
    font-size: clamp(0.313rem, 3dvw, 1.5rem);
    color: #666;">Nenhum agendamento no cache.</p>` 
            : S_local.map((item, index) => `
                <div class="sota-cart-item">
                    <div>
                        <strong>${item.servico}</strong><br>
                        <small>${item.data} às ${item.hora}</small>
                    </div>
                    <button class="sota-btn-excluir" data-index="${index}">×</button>
                </div>
            `).join('');

        overlay.innerHTML = `
            <div class="sota-modal">
                <h2>Meus Agendamentos</h2>
                <div style="display:flex; flex-direction:column; gap:10px; max-height: 50vh; overflow-y: auto;">
                    ${htmlItens}
                </div>
                <button class="sota-btn-acao" id="sota-btn-confirmar-zap" ${S_local.length === 0 ? 'disabled' : ''}>Confirmar no WhatsApp</button>
                <button class="sota-btn-acao secundario" id="sota-btn-cancelar">Fechar</button>
            </div>
        `;
        
        requestAnimationFrame(() => overlay.classList.add('ativo'));
    };

    // 6. Roteador de Eventos O(1) (Central de Interrupções)
    document.body.addEventListener('click', (evento) => {
        const alvo = evento.target;

        // A. Clique no botão de reservar original da página
        const botaoReservar = alvo.closest('button');
        if (botaoReservar && botaoReservar.id !== 'btn-rodape' && botaoReservar.textContent.includes('Reservar')) {
            let nomeServico = "Corte Padrão";
            const cluster = botaoReservar.closest('.conteiner-filhos-assinantes') || botaoReservar.closest('.conteiner-filhos-demais-cortes');
            if (cluster) nomeServico = cluster.querySelector('p')?.textContent?.trim() || nomeServico;
            
            abrirModalReserva(nomeServico);
            return;
        }

        // B. Clique em "Meus Agendamentos" no Rodapé
        if (alvo.closest('#btn-rodape')) {
            abrirModalCarrinho();
            return;
        }

        // C. Seleção de Horário na Grade
        if (alvo.classList.contains('sota-btn-hora')) {
            document.querySelectorAll('.sota-btn-hora').forEach(btn => btn.classList.remove('selecionado'));
            alvo.classList.add('selecionado');
            bufferInteracao.hora = alvo.dataset.hora;
            document.getElementById('sota-btn-adicionar').disabled = false;
            return;
        }
        
        // D. Ação: Adicionar ao Carrinho
        if (alvo.id === 'sota-btn-adicionar') {
            // 1. Mutex Global Simulado
            if (!S_global[bufferInteracao.data]) S_global[bufferInteracao.data] = [];
            S_global[bufferInteracao.data].push(bufferInteracao.hora);
            syncGlobal();

            // 2. Injeção no Vetor Local
            S_local.push({ id: Date.now(), ...bufferInteracao });
            syncLocal();
            
            // 3. Fechamento do Loop Cognitivo (Disparo SOTA)
            dispararAlertaSOTA(bufferInteracao.servico);
            
            // 4. Descarte do Componente Modal
            fecharModal();
            return;
        }
        // E. Ação: Remover item do carrinho
        if (alvo.classList.contains('sota-btn-excluir')) {
            const index = alvo.dataset.index;
            const item = S_local[index];
            
            // Liberar Lock Global
            S_global[item.data] = S_global[item.data].filter(h => h !== item.hora);
            syncGlobal();

            // Mutação Local
            S_local.splice(index, 1);
            syncLocal();
            abrirModalCarrinho(); // Re-renderizar arvore
            return;
        }

        // F. Ação: Despacho para WhatsApp (Output de I/O)
        if (alvo.id === 'sota-btn-confirmar-zap') {
            let payload = "Fala, mestre! Quero confirmar estes agendamentos:\n\n";
            S_local.forEach(x => {
                // Conversão de YYYY-MM-DD para DD/MM/YYYY
                const [y, m, d] = x.data.split('-');
                payload += `✂️ *${x.servico}*\n📅 Dia: ${d}/${m}/${y}\n⏰ Hora: ${x.hora}\n\n`;
            });
            
            // Limpa o estado local pós-transferência
            S_local = [];
            syncLocal();
            
            window.location.href = URI_BASE + encodeURIComponent(payload);
            return;
        }

        // G. Cancelamento Geral / Fechamento de Overlay
        if (alvo.id === 'sota-btn-cancelar' || alvo.id === 'sota-overlay') {
            fecharModal();
            return;
        }
    });

   // 7. Roteador de Eventos de Mutação O(1) (Inputs)
    document.body.addEventListener('change', (evento) => {
        const alvo = evento.target;

        if (alvo.id === 'sota-input-data') {
            const gridHoras = document.getElementById('sota-grid-horas');
            const btnAdd = document.getElementById('sota-btn-adicionar');
            btnAdd.disabled = true;
            bufferInteracao.hora = null;

            // Extração de vetores da data YYYY-MM-DD
            const [ano, mes, dia] = alvo.value.split('-').map(Number);
            const dataSelecionada = new Date(ano, mes - 1, dia); // Fuso estrito do cliente
            const diaSemana = dataSelecionada.getDay();

            if (diaSemana === 0) {
                alert("Restrição: Domingos indisponíveis.");
                alvo.value = '';
                gridHoras.innerHTML = '';
                return;
            }

            bufferInteracao.data = alvo.value;

            // Variáveis de Estado Contínuo (Epoch Time)
            const T_now = Date.now(); 
            const BUFFER_MS = 15 * 60 * 1000; // Delta t = 15 minutos de tolerância
            const horasOcupadas = S_global[alvo.value] || [];

            // Geração Vetorial e Poda Temporal
            gridHoras.innerHTML = HORARIOS_DISPONIVEIS.map(horaStr => {
                const [horaEscalar, minutoEscalar] = horaStr.split(':').map(Number);
                
                // Compilação do Timestamp do Bloco Específico
                const dataBloco = new Date(ano, mes - 1, dia, horaEscalar, minutoEscalar, 0, 0);
                const T_slot = dataBloco.getTime();
                
                // Restrição 1: Flecha do Tempo (Impede agendamento no passado ou muito próximo)
                const isPassado = T_slot <= (T_now + BUFFER_MS);
                
                // Restrição 2: Mutex Espacial
                const isOcupado = horasOcupadas.includes(horaStr);
                
                const isBloqueado = (isPassado || isOcupado) ? 'disabled' : '';
                
                return `<button class="sota-btn-hora" data-hora="${horaStr}" ${isBloqueado}>${horaStr}</button>`;
            }).join('');
        }
    });

})();
