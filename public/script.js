// ====== SCRIPT PARA INVITACION.HTML (SCROLL Y CONTADOR) ======
document.addEventListener("DOMContentLoaded", () => {
    
    // LÓGICA DEL CONTADOR
    const fechaBoda = new Date('2026-12-19T17:00:00-06:00').getTime();
    
    const elementoDias = document.getElementById('dias');
    const elementoHoras = document.getElementById('horas');
    const elementoMinutos = document.getElementById('minutos');
    const elementoSegundos = document.getElementById('segundos');
    
    if (elementoDias && elementoHoras && elementoMinutos && elementoSegundos) {
        const temporizador = setInterval(() => {
            const ahora = new Date().getTime();
            const diferencia = fechaBoda - ahora;
            
            const dias = Math.floor(diferencia / (1000 * 60 * 60 * 24));
            const horas = Math.floor((diferencia % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const minutos = Math.floor((diferencia % (1000 * 60 * 60)) / (1000 * 60));
            const segundos = Math.floor((diferencia % (1000 * 60)) / 1000);
            
            elementoDias.innerText = String(dias).padStart(2, '0');
            elementoHoras.innerText = String(horas).padStart(2, '0');
            elementoMinutos.innerText = String(minutos).padStart(2, '0');
            elementoSegundos.innerText = String(segundos).padStart(2, '0');
            
            if (diferencia < 0) {
                clearInterval(temporizador);
                elementoDias.innerText = "00"; 
                elementoHoras.innerText = "00"; 
                elementoMinutos.innerText = "00"; 
                elementoSegundos.innerText = "00";
            }
        }, 1000);
    }

    // Importar lógica de Firebase
    import('./js/invitation.js?v=10').catch(() => {
        const status = document.getElementById('invitation-status');
        if (status) status.textContent = 'No pudimos conectar con la invitación. Revisa tu conexión y vuelve a cargar la página.';
    });
    

    // === V2: mejorar foco, teclado móvil y uso horizontal del RSVP ===
    // Sin modificar las transacciones ni las funciones de Firebase.
    const overlaysRsvp = Array.from(document.querySelectorAll('.rsvp-overlay'));
    const viewportRsvp = window.visualViewport;
    let mayorAltoVisible = Math.max(window.innerHeight, viewportRsvp?.height || 0);

    function modalActivo() {
        // La invitación existente ya abre/cierra los modales mediante hidden.
        return overlaysRsvp.findLast
            ? overlaysRsvp.findLast(el => !el.hidden)
            : overlaysRsvp.slice().reverse().find(el => !el.hidden);
    }

    function actualizarTecladoRsvp() {
        const actual = viewportRsvp?.height || window.innerHeight;
        const elemento = document.activeElement;
        const escribiendo = elemento instanceof HTMLInputElement &&
            !elemento.disabled && !elemento.readOnly &&
            ['text', 'email', 'search', 'tel', 'number'].includes(elemento.type);
        const abierto = escribiendo && mayorAltoVisible - actual > 115;
        overlaysRsvp.forEach(el => {
            el.classList.toggle('rsvp-keyboard-visible', Boolean(abierto && !el.hidden));
        });
        if (!escribiendo && actual > mayorAltoVisible) mayorAltoVisible = actual;
    }

    const enfocabless = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    function controlesEnModal(modal) {
        return Array.from(modal.querySelectorAll(enfocabless))
            .filter(el => !el.closest('[hidden]') && el.getClientRects().length > 0);
    }

    // Evita que Tab/Shift+Tab salgan del modal a campos del fondo.
    document.addEventListener('keydown', event => {
        if (event.key !== 'Tab') return;
        const modal = modalActivo();
        if (!modal) return;
        const controles = controlesEnModal(modal);
        if (!controles.length) return;
        const primero = controles[0], ultimo = controles[controles.length - 1];
        const dentro = modal.contains(document.activeElement);
        if (!dentro || (event.shiftKey && document.activeElement === primero)) {
            event.preventDefault();
            (event.shiftKey && dentro ? ultimo : primero).focus();
        } else if (!event.shiftKey && document.activeElement === ultimo) {
            event.preventDefault();
            primero.focus();
        }
    });

    // Al enfocar campos del RSVP, dejarlos visibles con el teclado virtual.
    document.addEventListener('focusin', event => {
        const campo = event.target;
        if (!(campo instanceof HTMLInputElement) || campo.disabled || campo.readOnly) return;
        if (!campo.closest('.rsvp-overlay, #rsvp-section')) return;
        window.setTimeout(() => {
            if (document.activeElement !== campo) return;
            actualizarTecladoRsvp();
            // block:nearest evita saltos grandes en la invitación.
            campo.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'auto' });
        }, 220);
    });
    document.addEventListener('focusout', () => window.setTimeout(actualizarTecladoRsvp, 100));

    if (viewportRsvp) viewportRsvp.addEventListener('resize', actualizarTecladoRsvp);
    window.addEventListener('resize', actualizarTecladoRsvp);
    window.addEventListener('orientationchange', () => {
        // El teclado no debe confundirse con el giro del teléfono.
        window.setTimeout(() => {
            mayorAltoVisible = Math.max(window.innerHeight, viewportRsvp?.height || 0);
            actualizarTecladoRsvp();
        }, 350);
    });

    // BOTÓN: VOLVER AL INICIO
    const btnVolverInicio = document.getElementById('volver-al-inicio');
    const inicioInvitacion = document.getElementById('inicio-invitacion');

    if (btnVolverInicio && inicioInvitacion) {
        btnVolverInicio.addEventListener('click', () => {
            inicioInvitacion.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        });
    }
});